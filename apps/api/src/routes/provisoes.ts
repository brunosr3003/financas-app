import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  atualizarCreditoInput,
  atualizarProvisaoInput,
  criarCreditoInput,
  criarProvisaoInput,
} from "@financas/shared";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";
import { cronograma, posicao } from "../dominio/credito.js";

function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Reserva mensal equivalente das nao mensais (RN-16). */
function reservaMensal(recorrencia: string, valor: number): number {
  const div = recorrencia === "anual" ? 12 : recorrencia === "semestral" ? 6 : recorrencia === "trimestral" ? 3 : 1;
  return Math.round((valor / div) * 100) / 100;
}

export async function provisoesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Painel consultivo (tela 4.5): grupos + provisionamento fixo mensal
  app.get("/provisoes/painel", async (req) => {
    const hoje = hojeISO();
    return withEmpresa(req.user.empresaId, async (tx) => {
      const provisoes = await tx
        .select()
        .from(t.provisao)
        .where(and(eq(t.provisao.empresaId, req.user.empresaId), eq(t.provisao.automatica, false)));
      const creditos = await tx
        .select()
        .from(t.credito)
        .where(eq(t.credito.empresaId, req.user.empresaId));

      const servicosMensais = provisoes.filter((p) => p.recorrencia === "mensal" && p.tipo === "saida");
      const naoMensais = provisoes
        .filter((p) => ["anual", "semestral", "trimestral"].includes(p.recorrencia))
        .map((p) => ({ ...p, reservaMensal: reservaMensal(p.recorrencia, Number(p.valor ?? 0)) }));
      const creditosComPosicao = creditos.map((c) => ({ ...c, posicao: posicao(c, hoje) }));

      const automaticasOff = await tx
        .select({ faturaId: t.provisao.faturaId })
        .from(t.provisao)
        .where(
          and(eq(t.provisao.empresaId, req.user.empresaId), eq(t.provisao.automatica, true), eq(t.provisao.ativa, false)),
        );

      const totalServicos = servicosMensais.reduce((s, p) => s + Number(p.valor ?? 0), 0);
      const totalReservas = naoMensais.reduce((s, p) => s + p.reservaMensal, 0);
      const totalCredito = creditosComPosicao
        .filter((c) => c.ativa && c.posicao.restantes > 0)
        .reduce((s, c) => s + (c.posicao.parcelaCorrente?.valor ?? 0), 0);

      return {
        servicosMensais,
        naoMensais,
        creditos: creditosComPosicao,
        faturasDesligadas: automaticasOff.map((a) => a.faturaId).filter(Boolean),
        resumo: {
          servicosMensais: totalServicos,
          reservaNaoMensais: totalReservas,
          creditoMensal: totalCredito,
          // Faturas de cartao ficam de fora por serem variaveis (tela 4.5)
          provisionamentoFixoMensal: Math.round((totalServicos + totalReservas + totalCredito) * 100) / 100,
        },
      };
    });
  });

  app.post("/provisoes", async (req, reply) => {
    const i = criarProvisaoInput.parse(req.body);
    const criada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [p] = await tx
        .insert(t.provisao)
        .values({
          empresaId: req.user.empresaId,
          nome: i.nome,
          tipo: i.tipo,
          valor: i.valor != null ? i.valor.toFixed(2) : null,
          dia: i.dia,
          mesVencimento: i.mesVencimento,
          recorrencia: i.recorrencia,
          contaId: i.contaId,
          baldeId: i.baldeId,
          projetoId: i.projetoId,
          tipoValor: i.tipoValor,
          diaConferencia: i.diaConferencia,
          ativa: i.ativa,
        })
        .returning();
      return p;
    });
    return reply.code(201).send(criada);
  });

  app.patch("/provisoes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = atualizarProvisaoInput.extend({ ativa: criarProvisaoInput.shape.ativa.optional() }).parse(req.body);
    const atualizada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [p] = await tx
        .update(t.provisao)
        .set({
          ...(i.nome !== undefined && { nome: i.nome }),
          ...(i.tipo !== undefined && { tipo: i.tipo }),
          ...(i.valor !== undefined && { valor: i.valor != null ? i.valor.toFixed(2) : null }),
          ...(i.dia !== undefined && { dia: i.dia }),
          ...(i.mesVencimento !== undefined && { mesVencimento: i.mesVencimento }),
          ...(i.recorrencia !== undefined && { recorrencia: i.recorrencia }),
          ...(i.contaId !== undefined && { contaId: i.contaId }),
          ...(i.baldeId !== undefined && { baldeId: i.baldeId }),
          ...(i.tipoValor !== undefined && { tipoValor: i.tipoValor }),
          ...(i.diaConferencia !== undefined && { diaConferencia: i.diaConferencia }),
          ...(i.ativa !== undefined && { ativa: i.ativa }),
        })
        .where(and(eq(t.provisao.id, id), eq(t.provisao.empresaId, req.user.empresaId)))
        .returning();
      return p;
    });
    if (!atualizada) return reply.notFound("Provisao nao encontrada");
    return atualizada;
  });

  app.delete("/provisoes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [removida] = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .delete(t.provisao)
        .where(and(eq(t.provisao.id, id), eq(t.provisao.empresaId, req.user.empresaId)))
        .returning(),
    );
    if (!removida) return reply.notFound("Provisao nao encontrada");
    return { ok: true };
  });

  // Toggle de projecao automatica de fatura (RN-08/09): cria/atualiza a provisao automatica
  app.post("/faturas/:id/projecao", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { ativa } = req.body as { ativa: boolean };
    const resultado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [f] = await tx.select().from(t.fatura).where(eq(t.fatura.id, id));
      if (!f) return null;
      const [existente] = await tx
        .select()
        .from(t.provisao)
        .where(and(eq(t.provisao.faturaId, f.id), eq(t.provisao.automatica, true)));
      if (existente) {
        const [p] = await tx.update(t.provisao).set({ ativa }).where(eq(t.provisao.id, existente.id)).returning();
        return p;
      }
      const [p] = await tx
        .insert(t.provisao)
        .values({
          empresaId: req.user.empresaId,
          nome: "Fatura de cartao",
          tipo: "saida",
          recorrencia: "unica",
          faturaId: f.id,
          automatica: true,
          ativa,
        })
        .returning();
      return p;
    });
    if (!resultado) return reply.notFound("Fatura nao encontrada");
    return resultado;
  });

  // --- Credito (RN-20) ------------------------------------------------------
  app.post("/creditos", async (req, reply) => {
    const i = criarCreditoInput.parse(req.body);
    const criado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .insert(t.credito)
        .values({
          empresaId: req.user.empresaId,
          nome: i.nome,
          banco: i.banco,
          sistema: i.sistema,
          taxaMes: i.taxaMes.toFixed(4),
          principal: i.principal.toFixed(2),
          inicio: `${i.inicio}-01`,
          fim: `${i.fim}-01`,
          diaVencimento: i.diaVencimento,
          contaId: i.contaId,
        })
        .returning();
      return c;
    });
    return reply.code(201).send(criado);
  });

  app.patch("/creditos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = atualizarCreditoInput.parse(req.body);
    const atualizado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .update(t.credito)
        .set({
          ...(i.nome !== undefined && { nome: i.nome }),
          ...(i.banco !== undefined && { banco: i.banco }),
          ...(i.sistema !== undefined && { sistema: i.sistema }),
          ...(i.taxaMes !== undefined && { taxaMes: i.taxaMes.toFixed(4) }),
          ...(i.principal !== undefined && { principal: i.principal.toFixed(2) }),
          ...(i.inicio !== undefined && { inicio: `${i.inicio}-01` }),
          ...(i.fim !== undefined && { fim: `${i.fim}-01` }),
          ...(i.diaVencimento !== undefined && { diaVencimento: i.diaVencimento }),
          ...(i.contaId !== undefined && { contaId: i.contaId }),
          ...(i.ativa !== undefined && { ativa: i.ativa }),
        })
        .where(and(eq(t.credito.id, id), eq(t.credito.empresaId, req.user.empresaId)))
        .returning();
      return c;
    });
    if (!atualizado) return reply.notFound("Credito nao encontrado");
    return atualizado;
  });

  // Tela "Projetar parcelas" (RN-20)
  app.get("/creditos/:id/cronograma", async (req, reply) => {
    const { id } = req.params as { id: string };
    const resultado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .select()
        .from(t.credito)
        .where(and(eq(t.credito.id, id), eq(t.credito.empresaId, req.user.empresaId)));
      if (!c) return null;
      return { credito: c, posicao: posicao(c, hojeISO()), parcelas: cronograma(c) };
    });
    if (!resultado) return reply.notFound("Credito nao encontrado");
    return resultado;
  });
}
