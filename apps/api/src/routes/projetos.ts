import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  atualizarProjetoInput,
  criarEtapaInput,
  criarPagamentoProjetoInput,
  criarProjetoInput,
} from "@financas/shared";
import * as t from "../db/schema.js";
import { withEmpresa, type Tx } from "../db/with-empresa.js";
import { auditar } from "../seguranca/auditoria.js";
import { dec, enc } from "../seguranca/crypto.js";

function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * RN-13: realizado = pagamentos pagos + avulsas de conta + itens de cartao ja
 * de competencia vencida; comprometido = agendados ativos + parcelas futuras.
 */
async function numerosProjeto(tx: Tx, empresaId: string, projetoId: string, etapaId?: string) {
  const hoje = hojeISO();
  const filtroEtapa = etapaId ? sql` and etapa_id = ${etapaId}` : sql``;
  const [linha] = (await tx.execute(sql`
    select
      coalesce((select sum(valor) from pagamento_projeto
        where empresa_id = ${empresaId} and projeto_id = ${projetoId} and status = 'pago'${filtroEtapa}), 0) as pagos,
      coalesce((select sum(valor) from pagamento_projeto pp
        join projeto pj on pj.id = pp.projeto_id
        where pp.empresa_id = ${empresaId} and pp.projeto_id = ${projetoId}
          and pp.status = 'agendado' and pp.ativa = true and pj.ativo = true${filtroEtapa}), 0) as agendados,
      coalesce((select sum(valor) from transacao
        where empresa_id = ${empresaId} and projeto_id = ${projetoId} and tipo = 'saida'
          and origem = 'conta' and pendente = false
          -- saidas geradas por pagamento de projeto ja contam em "pagos"
          and id not in (select transacao_id from pagamento_projeto where transacao_id is not null)${filtroEtapa}), 0) as avulsas,
      coalesce((select sum(valor) from transacao
        where empresa_id = ${empresaId} and projeto_id = ${projetoId} and tipo = 'saida'
          and origem = 'cartao' and pendente = false and data <= ${hoje}${filtroEtapa}), 0) as cartao_faturado,
      coalesce((select sum(valor) from transacao
        where empresa_id = ${empresaId} and projeto_id = ${projetoId} and tipo = 'saida'
          and origem = 'cartao' and pendente = false and data > ${hoje}${filtroEtapa}), 0) as cartao_futuro
  `)) as unknown as [Record<string, string>];

  const realizado = Number(linha!.pagos) + Number(linha!.avulsas) + Number(linha!.cartao_faturado);
  const comprometido = Number(linha!.agendados) + Number(linha!.cartao_futuro);
  return { realizado, comprometido };
}

export async function projetosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/projetos", async (req) => {
    return withEmpresa(req.user.empresaId, async (tx) => {
      const projetos = await tx
        .select()
        .from(t.projeto)
        .where(and(eq(t.projeto.empresaId, req.user.empresaId), eq(t.projeto.arquivado, false)));
      return Promise.all(
        projetos.map(async (p) => {
          const n = await numerosProjeto(tx, req.user.empresaId, p.id);
          return { ...p, ...n, livre: Number(p.budgetTotal) - n.realizado - n.comprometido };
        }),
      );
    });
  });

  app.post("/projetos", async (req, reply) => {
    const i = criarProjetoInput.parse(req.body);
    const criado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [p] = await tx
        .insert(t.projeto)
        .values({ empresaId: req.user.empresaId, nome: i.nome, budgetTotal: i.budgetTotal.toFixed(2) })
        .returning();
      await auditar(tx, req, { acao: "projeto.criar", entidade: "projeto", entidadeId: p?.id });
      return p;
    });
    return reply.code(201).send(criado);
  });

  app.patch("/projetos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = atualizarProjetoInput.parse(req.body);
    const atualizado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [p] = await tx
        .update(t.projeto)
        .set({
          ...(i.nome !== undefined && { nome: i.nome }),
          ...(i.budgetTotal !== undefined && { budgetTotal: i.budgetTotal.toFixed(2) }),
          ...(i.ativo !== undefined && { ativo: i.ativo }),
          ...(i.arquivado !== undefined && { arquivado: i.arquivado }),
        })
        .where(and(eq(t.projeto.id, id), eq(t.projeto.empresaId, req.user.empresaId)))
        .returning();
      if (p && i.ativo !== undefined)
        await auditar(tx, req, { acao: `projeto.${i.ativo ? "ligar" : "desligar"}`, entidade: "projeto", entidadeId: p.id });
      return p;
    });
    if (!atualizado) return reply.notFound("Projeto nao encontrado");
    return atualizado;
  });

  // Detalhe: etapas com numeros + fluxo de pagamento (RN-13)
  app.get("/projetos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const detalhe = await withEmpresa(req.user.empresaId, async (tx) => {
      const [p] = await tx
        .select()
        .from(t.projeto)
        .where(and(eq(t.projeto.id, id), eq(t.projeto.empresaId, req.user.empresaId)));
      if (!p) return null;

      const etapas = await tx.select().from(t.etapaProjeto).where(eq(t.etapaProjeto.projetoId, p.id));
      const etapasComNumeros = await Promise.all(
        etapas.map(async (e) => {
          const n = await numerosProjeto(tx, req.user.empresaId, p.id, e.id);
          return { ...e, ...n, livre: Number(e.budget) - n.realizado - n.comprometido };
        }),
      );
      const somaEtapas = etapas.reduce((s, e) => s + Number(e.budget), 0);

      const pagamentos = (
        await tx.select().from(t.pagamentoProjeto).where(eq(t.pagamentoProjeto.projetoId, p.id))
      ).map((pg) => ({ ...pg, descricao: dec(pg.descricao) }));

      const n = await numerosProjeto(tx, req.user.empresaId, p.id);
      return {
        ...p,
        ...n,
        livre: Number(p.budgetTotal) - n.realizado - n.comprometido,
        etapas: etapasComNumeros,
        somaEtapas,
        // aviso quando a soma das etapas diverge do budget (sem bloquear)
        etapasDivergem: Math.abs(somaEtapas - Number(p.budgetTotal)) > 0.005,
        pagamentos,
      };
    });
    if (!detalhe) return reply.notFound("Projeto nao encontrado");
    return detalhe;
  });

  app.post("/projetos/:id/etapas", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = criarEtapaInput.parse(req.body);
    const criada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [e] = await tx
        .insert(t.etapaProjeto)
        .values({ empresaId: req.user.empresaId, projetoId: id, nome: i.nome, budget: i.budget.toFixed(2) })
        .returning();
      return e;
    });
    return reply.code(201).send(criada);
  });

  app.post("/projetos/:id/pagamentos", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = criarPagamentoProjetoInput.parse(req.body);
    const criado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [pg] = await tx
        .insert(t.pagamentoProjeto)
        .values({
          empresaId: req.user.empresaId,
          projetoId: id,
          etapaId: i.etapaId,
          descricao: enc(i.descricao),
          valor: i.valor.toFixed(2),
          dataPrevista: i.dataPrevista,
          contaId: i.contaId,
        })
        .returning();
      if (i.jaPago && pg) return pagarPagamento(tx, req, pg.id, i.dataPrevista);
      return pg;
    });
    return reply.code(201).send(criado);
  });

  // Toggle individual da projecao do pagamento (RN-09)
  app.patch("/pagamentos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { ativa } = req.body as { ativa: boolean };
    const atualizado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [pg] = await tx
        .update(t.pagamentoProjeto)
        .set({ ativa })
        .where(and(eq(t.pagamentoProjeto.id, id), eq(t.pagamentoProjeto.empresaId, req.user.empresaId)))
        .returning();
      return pg;
    });
    if (!atualizado) return reply.notFound("Pagamento nao encontrado");
    return atualizado;
  });

  // Botao Pagar (RN-13): gera saida de caixa, sai das projecoes, consolida realizado
  app.post("/pagamentos/:id/pagar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data } = (req.body ?? {}) as { data?: string };
    const resultado = await withEmpresa(req.user.empresaId, (tx) => pagarPagamento(tx, req, id, data ?? hojeISO()));
    if (!resultado) return reply.notFound("Pagamento nao encontrado ou ja pago");
    return resultado;
  });

  async function pagarPagamento(tx: Tx, req: Parameters<typeof auditar>[1], id: string, data: string) {
    const [pg] = await tx
      .select()
      .from(t.pagamentoProjeto)
      .where(and(eq(t.pagamentoProjeto.id, id), eq(t.pagamentoProjeto.status, "agendado")));
    if (!pg) return null;

    const [saida] = await tx
      .insert(t.transacao)
      .values({
        empresaId: req.user.empresaId,
        tipo: "saida",
        origem: "conta",
        contaId: pg.contaId,
        forma: "transferencia",
        descricao: pg.descricao, // ja cifrada
        valor: pg.valor,
        data,
        projetoId: pg.projetoId,
        etapaId: pg.etapaId,
      })
      .returning();

    const [atualizado] = await tx
      .update(t.pagamentoProjeto)
      .set({ status: "pago", dataPagamento: data, transacaoId: saida?.id })
      .where(eq(t.pagamentoProjeto.id, pg.id))
      .returning();
    await auditar(tx, req, { acao: "projeto.pagamento.pagar", entidade: "pagamento_projeto", entidadeId: pg.id });
    return { ...atualizado, descricao: atualizado ? dec(atualizado.descricao) : undefined };
  }
}
