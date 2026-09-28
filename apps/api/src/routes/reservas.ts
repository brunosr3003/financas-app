import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { criarAplicacaoInput, criarReservaInput, movimentoAplicacaoInput } from "@financas/shared";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";

export async function reservasRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // RN-19: reserva = objetivo com meta; aplicacoes somam o progresso
  app.get("/reservas", async (req) => {
    return withEmpresa(req.user.empresaId, async (tx) => {
      const reservas = await tx.select().from(t.reserva).where(eq(t.reserva.empresaId, req.user.empresaId));
      return Promise.all(
        reservas.map(async (r) => {
          const aplicacoes = await tx.select().from(t.aplicacao).where(eq(t.aplicacao.reservaId, r.id));
          const total = aplicacoes.reduce((s, a) => s + Number(a.valorAtual), 0);
          return {
            ...r,
            aplicacoes,
            total,
            progresso: Number(r.meta) > 0 ? Math.round((total / Number(r.meta)) * 1000) / 10 : null,
          };
        }),
      );
    });
  });

  app.post("/reservas", async (req, reply) => {
    const i = criarReservaInput.parse(req.body);
    const [criada] = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .insert(t.reserva)
        .values({ empresaId: req.user.empresaId, nome: i.nome, meta: i.meta.toFixed(2) })
        .returning(),
    );
    return reply.code(201).send(criada);
  });

  app.post("/reservas/:id/aplicacoes", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = criarAplicacaoInput.parse(req.body);
    const [criada] = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .insert(t.aplicacao)
        .values({
          empresaId: req.user.empresaId,
          reservaId: id,
          instituicao: i.instituicao,
          produto: i.produto,
          valorAtual: i.valorAtual.toFixed(2),
        })
        .returning(),
    );
    return reply.code(201).send(criada);
  });

  // Rendimento (+) / custo (−): atualiza valor atual e preserva historico (RN-19)
  app.post("/aplicacoes/:id/movimentos", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = movimentoAplicacaoInput.parse(req.body);
    const resultado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [apl] = await tx
        .select()
        .from(t.aplicacao)
        .where(and(eq(t.aplicacao.id, id), eq(t.aplicacao.empresaId, req.user.empresaId)));
      if (!apl) return null;

      await tx.insert(t.movimentoAplicacao).values({
        empresaId: req.user.empresaId,
        aplicacaoId: apl.id,
        tipo: i.tipo,
        valor: i.valor.toFixed(2),
        data: i.data,
      });
      const novoValor = Number(apl.valorAtual) + (i.tipo === "rendimento" ? i.valor : -i.valor);
      const [atualizada] = await tx
        .update(t.aplicacao)
        .set({ valorAtual: novoValor.toFixed(2) })
        .where(eq(t.aplicacao.id, apl.id))
        .returning();
      return atualizada;
    });
    if (!resultado) return reply.notFound("Aplicacao nao encontrada");
    return resultado;
  });

  app.get("/aplicacoes/:id/movimentos", async (req) => {
    const { id } = req.params as { id: string };
    return withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.movimentoAplicacao)
        .where(and(eq(t.movimentoAplicacao.aplicacaoId, id), eq(t.movimentoAplicacao.empresaId, req.user.empresaId)))
        .orderBy(asc(t.movimentoAplicacao.data)),
    );
  });
}
