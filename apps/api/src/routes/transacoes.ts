import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { lancamentoInput, pagarFaturaInput, transferenciaInput } from "@financas/shared";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";
import { addMeses, dividirParcelas, faturaParaCompra } from "../dominio/fatura.js";
import { auditar } from "../seguranca/auditoria.js";
import { dec, enc } from "../seguranca/crypto.js";

function decLinhas<T extends { descricao: string }>(linhas: T[]): T[] {
  return linhas.map((l) => ({ ...l, descricao: dec(l.descricao) }));
}

export async function transacoesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/transacoes", async (req) => {
    const linhas = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.transacao)
        .where(eq(t.transacao.empresaId, req.user.empresaId))
        .orderBy(desc(t.transacao.data))
        .limit(200),
    );
    return decLinhas(linhas);
  });

  // RN-15: itens de uma fatura; ?q= busca por texto em todas as faturas do cartao
  app.get("/faturas/:id/itens", async (req, reply) => {
    const { id } = req.params as { id: string };
    const itens = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.transacao)
        .where(and(eq(t.transacao.faturaId, id), eq(t.transacao.empresaId, req.user.empresaId)))
        .orderBy(desc(t.transacao.data)),
    );
    if (itens.length === 0) {
      const [f] = await withEmpresa(req.user.empresaId, (tx) =>
        tx.select().from(t.fatura).where(eq(t.fatura.id, id)),
      );
      if (!f) return reply.notFound("Fatura nao encontrada");
    }
    return decLinhas(itens);
  });

  app.get("/cartoes/:id/busca", async (req) => {
    const { id } = req.params as { id: string };
    const { q } = req.query as { q?: string };
    const itens = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.transacao)
        .where(and(eq(t.transacao.cartaoId, id), eq(t.transacao.empresaId, req.user.empresaId)))
        .orderBy(desc(t.transacao.data)),
    );
    // Campo cifrado nao e pesquisavel em SQL: decifra e filtra na aplicacao
    const decifradas = decLinhas(itens);
    if (!q) return decifradas;
    const termo = q.toLowerCase();
    return decifradas.filter((i) => i.descricao.toLowerCase().includes(termo));
  });

  /**
   * Lancamento (modal unico da spec, secao 4.6):
   * - origem conta → movimenta caixa (aparece no DFC);
   * - origem cartao → NAO movimenta caixa: cai na fatura do ciclo (RN-03),
   *   parcelado gera N transacoes nas N faturas seguintes (RN-05),
   *   faturaId explicita = lancamento retroativo (RN-15).
   */
  app.post("/transacoes", async (req, reply) => {
    const i = lancamentoInput.parse(req.body);
    const empresaId = req.user.empresaId;

    const criadas = await withEmpresa(empresaId, async (tx) => {
      if (i.origem === "conta") {
        const [conta] = await tx
          .select()
          .from(t.conta)
          .where(and(eq(t.conta.id, i.contaId), eq(t.conta.arquivada, false)));
        if (!conta) throw Object.assign(new Error("Conta nao encontrada ou arquivada"), { statusCode: 404 });

        return tx
          .insert(t.transacao)
          .values({
            empresaId,
            tipo: i.tipo,
            origem: "conta",
            contaId: i.contaId,
            forma: i.forma,
            descricao: enc(i.descricao),
            valor: i.valor.toFixed(2),
            data: i.data,
            baldeId: i.baldeId,
            projetoId: i.projetoId,
            etapaId: i.etapaId,
            pendente: i.pendente,
          })
          .returning();
      }

      // origem = cartao
      const [card] = await tx
        .select()
        .from(t.cartao)
        .where(and(eq(t.cartao.id, i.cartaoId), eq(t.cartao.arquivado, false)));
      if (!card) throw Object.assign(new Error("Cartao nao encontrado ou arquivado"), { statusCode: 404 });

      // Lancamento retroativo em fatura especifica (RN-15)
      if (i.faturaId) {
        const [f] = await tx.select().from(t.fatura).where(eq(t.fatura.id, i.faturaId));
        if (!f || f.cartaoId !== card.id)
          throw Object.assign(new Error("Fatura nao encontrada para este cartao"), { statusCode: 404 });
        if (f.status === "paga" && !f.ajustada) {
          await tx.update(t.fatura).set({ ajustada: true }).where(eq(t.fatura.id, f.id));
        }
        return tx
          .insert(t.transacao)
          .values({
            empresaId,
            tipo: "saida",
            origem: "cartao",
            cartaoId: card.id,
            faturaId: f.id,
            descricao: enc(i.descricao),
            valor: i.valor.toFixed(2),
            data: i.data,
            baldeId: i.baldeId,
            projetoId: i.projetoId,
            etapaId: i.etapaId,
            retroativa: true,
            pendente: i.pendente,
          })
          .returning();
      }

      // Compra normal, a vista ou parcelada (RN-05)
      const valores = dividirParcelas(i.valor, i.parcelas);
      let grupo: string | null = null;
      if (i.parcelas > 1) {
        const [p] = await tx
          .insert(t.parcelamento)
          .values({
            empresaId,
            cartaoId: card.id,
            descricao: enc(i.descricao),
            valorTotal: i.valor.toFixed(2),
            parcelasTotal: i.parcelas,
          })
          .returning();
        grupo = p?.id ?? null;
      }

      const linhas = [];
      for (let n = 0; n < i.parcelas; n += 1) {
        // Competencia da parcela: mes da compra + n (RN-02)
        const dataParcela = addMeses(i.data, n);
        const f = await faturaParaCompra(tx, card, dataParcela);
        linhas.push({
          empresaId,
          tipo: "saida" as const,
          origem: "cartao" as const,
          cartaoId: card.id,
          faturaId: f.id,
          descricao: enc(i.parcelas > 1 ? `${i.descricao} (${n + 1}/${i.parcelas})` : i.descricao),
          valor: valores[n]!.toFixed(2),
          data: dataParcela,
          baldeId: i.baldeId,
          projetoId: i.projetoId,
          etapaId: i.etapaId,
          parcelamentoId: grupo,
          parcelaNum: i.parcelas > 1 ? n + 1 : null,
          parcelaTotal: i.parcelas > 1 ? i.parcelas : null,
          pendente: i.pendente,
        });
      }
      const inseridas = await tx.insert(t.transacao).values(linhas).returning();
      await auditar(tx, req, {
        acao: "lancamento.criar",
        entidade: "transacao",
        entidadeId: inseridas[0]?.id,
        dados: { origem: i.origem, valor: i.valor, parcelas: i.parcelas },
      });
      return inseridas;
    });

    return reply.code(201).send(decLinhas(criadas));
  });

  // RN-14: transferencia move saldo entre contas, fora de baldes/relatorios
  app.post("/transferencias", async (req, reply) => {
    const i = transferenciaInput.parse(req.body);
    const criada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [criadaTx] = await tx
        .insert(t.transacao)
        .values({
          empresaId: req.user.empresaId,
          tipo: "transferencia",
          origem: "conta",
          contaId: i.contaOrigemId,
          contaDestinoId: i.contaDestinoId,
          forma: "transferencia",
          descricao: enc(i.descricao),
          valor: i.valor.toFixed(2),
          data: i.data,
        })
        .returning();
      await auditar(tx, req, { acao: "transferencia.criar", entidade: "transacao", entidadeId: criadaTx?.id });
      return criadaTx;
    });
    return reply.code(201).send(criada ? { ...criada, descricao: dec(criada.descricao) } : criada);
  });

  // Pendentes de confirmacao (criados via MCP/importacao)
  app.get("/pendentes", async (req) => {
    const linhas = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.transacao)
        .where(and(eq(t.transacao.empresaId, req.user.empresaId), eq(t.transacao.pendente, true)))
        .orderBy(desc(t.transacao.criadoEm)),
    );
    return decLinhas(linhas);
  });

  // Rejeitar um pendente (exclusao fisica so e permitida enquanto pendente)
  app.delete("/transacoes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [removida] = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .delete(t.transacao)
        .where(
          and(
            eq(t.transacao.id, id),
            eq(t.transacao.empresaId, req.user.empresaId),
            eq(t.transacao.pendente, true),
          ),
        )
        .returning(),
    );
    if (!removida) return reply.notFound("Transacao pendente nao encontrada");
    return { ok: true };
  });

  // Confirmar lancamento pendente (fluxo MCP/importacao OFX)
  app.post("/transacoes/:id/confirmar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const confirmada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [x] = await tx
        .update(t.transacao)
        .set({ pendente: false })
        .where(and(eq(t.transacao.id, id), eq(t.transacao.empresaId, req.user.empresaId)))
        .returning();
      return x;
    });
    if (!confirmada) return reply.notFound("Transacao nao encontrada");
    return confirmada;
  });

  // RN-04: pagamento de fatura, modelo boleto — conta escolhida na hora
  app.post("/faturas/:id/pagar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = pagarFaturaInput.parse(req.body);

    const resultado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [f] = await tx.select().from(t.fatura).where(eq(t.fatura.id, id));
      if (!f) throw Object.assign(new Error("Fatura nao encontrada"), { statusCode: 404 });
      if (f.status === "paga") throw Object.assign(new Error("Fatura ja esta paga"), { statusCode: 409 });

      const [{ total }] = (await tx.execute(
        // total da fatura e derivado da soma dos itens (spec 2.3)
        sql`select coalesce(sum(valor), 0)::numeric as total
            from ${t.transacao} where fatura_id = ${f.id}`,
      )) as unknown as [{ total: string }];

      // Saida de caixa na conta escolhida; NAO e gasto — sem balde (RN-04)
      const [pagamento] = await tx
        .insert(t.transacao)
        .values({
          empresaId: req.user.empresaId,
          tipo: "saida",
          origem: "conta",
          contaId: i.contaId,
          forma: "boleto",
          descricao: enc("Pagamento de fatura"),
          valor: i.valor.toFixed(2),
          data: i.data,
        })
        .returning();

      const valorPago = Number(f.valorPago) + i.valor;
      const quitada = valorPago >= Number(total) - 0.005;
      const [atualizada] = await tx
        .update(t.fatura)
        .set({ valorPago: valorPago.toFixed(2), status: quitada ? "paga" : f.status })
        .where(eq(t.fatura.id, f.id))
        .returning();
      await auditar(tx, req, {
        acao: "fatura.pagar",
        entidade: "fatura",
        entidadeId: f.id,
        dados: { valor: i.valor, quitada },
      });

      return { fatura: atualizada, pagamento, totalFatura: Number(total) };
    });
    return resultado;
  });

  app.get("/faturas", async (req) => {
    return withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.fatura)
        .where(eq(t.fatura.empresaId, req.user.empresaId))
        .orderBy(desc(t.fatura.cicloFim)),
    );
  });
}
