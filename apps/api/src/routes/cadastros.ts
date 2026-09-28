import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  atualizarBaldeInput,
  atualizarCartaoInput,
  atualizarContaInput,
  configInput,
  criarBaldeInput,
  criarCartaoInput,
  criarContaInput,
} from "@financas/shared";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";

export async function cadastrosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // --- Contas ---------------------------------------------------------------
  app.get("/contas", async (req) => {
    return withEmpresa(req.user.empresaId, (tx) =>
      tx.select().from(t.conta).where(eq(t.conta.empresaId, req.user.empresaId)),
    );
  });

  app.post("/contas", async (req, reply) => {
    const i = criarContaInput.parse(req.body);
    const criada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .insert(t.conta)
        .values({
          empresaId: req.user.empresaId,
          nome: i.nome,
          banco: i.banco,
          saldoInicial: i.saldoInicial.toFixed(2),
          dataSaldoInicial: i.dataSaldoInicial,
          cor: i.cor,
        })
        .returning();
      return c;
    });
    return reply.code(201).send(criada);
  });

  app.patch("/contas/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = atualizarContaInput.parse(req.body);
    const atualizada = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .update(t.conta)
        .set({
          ...(i.nome !== undefined && { nome: i.nome }),
          ...(i.banco !== undefined && { banco: i.banco }),
          ...(i.saldoInicial !== undefined && { saldoInicial: i.saldoInicial.toFixed(2) }),
          ...(i.dataSaldoInicial !== undefined && { dataSaldoInicial: i.dataSaldoInicial }),
          ...(i.cor !== undefined && { cor: i.cor }),
          ...(i.arquivada !== undefined && { arquivada: i.arquivada }),
        })
        .where(and(eq(t.conta.id, id), eq(t.conta.empresaId, req.user.empresaId)))
        .returning();
      return c;
    });
    if (!atualizada) return reply.notFound("Conta nao encontrada");
    return atualizada;
  });

  // --- Cartoes --------------------------------------------------------------
  app.get("/cartoes", async (req) => {
    return withEmpresa(req.user.empresaId, (tx) =>
      tx.select().from(t.cartao).where(eq(t.cartao.empresaId, req.user.empresaId)),
    );
  });

  app.post("/cartoes", async (req, reply) => {
    const i = criarCartaoInput.parse(req.body);
    const criado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .insert(t.cartao)
        .values({
          empresaId: req.user.empresaId,
          nome: i.nome,
          limite: i.limite.toFixed(2),
          diaFechamento: i.diaFechamento,
          diaVencimento: i.diaVencimento,
        })
        .returning();
      return c;
    });
    return reply.code(201).send(criado);
  });

  app.patch("/cartoes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = atualizarCartaoInput.parse(req.body);
    const atualizado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [c] = await tx
        .update(t.cartao)
        .set({
          ...(i.nome !== undefined && { nome: i.nome }),
          ...(i.limite !== undefined && { limite: i.limite.toFixed(2) }),
          ...(i.diaFechamento !== undefined && { diaFechamento: i.diaFechamento }),
          ...(i.diaVencimento !== undefined && { diaVencimento: i.diaVencimento }),
          ...(i.arquivado !== undefined && { arquivado: i.arquivado }),
        })
        .where(and(eq(t.cartao.id, id), eq(t.cartao.empresaId, req.user.empresaId)))
        .returning();
      return c;
    });
    if (!atualizado) return reply.notFound("Cartao nao encontrado");
    return atualizado;
  });

  // --- Baldes & renda -------------------------------------------------------
  app.get("/baldes", async (req) => {
    return withEmpresa(req.user.empresaId, async (tx) => {
      const baldes = await tx.select().from(t.balde).where(eq(t.balde.empresaId, req.user.empresaId));
      const [{ soma }] = (await tx.execute(
        sql`select coalesce(sum(pct), 0)::numeric as soma from ${t.balde} where empresa_id = ${req.user.empresaId}`,
      )) as unknown as [{ soma: string }];
      // RN-01: soma deve fechar 100 — aviso, sem bloquear
      return { baldes, somaPct: Number(soma), somaFecha100: Number(soma) === 100 };
    });
  });

  app.post("/baldes", async (req, reply) => {
    const i = criarBaldeInput.parse(req.body);
    const criado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [b] = await tx
        .insert(t.balde)
        .values({
          empresaId: req.user.empresaId,
          nome: i.nome,
          pct: i.pct.toFixed(2),
          descricao: i.descricao,
          cor: i.cor,
        })
        .returning();
      return b;
    });
    return reply.code(201).send(criado);
  });

  app.patch("/baldes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = atualizarBaldeInput.parse(req.body);
    const atualizado = await withEmpresa(req.user.empresaId, async (tx) => {
      const [b] = await tx
        .update(t.balde)
        .set({
          ...(i.nome !== undefined && { nome: i.nome }),
          ...(i.pct !== undefined && { pct: i.pct.toFixed(2) }),
          ...(i.descricao !== undefined && { descricao: i.descricao }),
          ...(i.cor !== undefined && { cor: i.cor }),
        })
        .where(and(eq(t.balde.id, id), eq(t.balde.empresaId, req.user.empresaId)))
        .returning();
      return b;
    });
    if (!atualizado) return reply.notFound("Balde nao encontrado");
    return atualizado;
  });

  // --- Config (renda-base) --------------------------------------------------
  app.get("/config", async (req) => {
    return withEmpresa(req.user.empresaId, async (tx) => {
      const [cfg] = await tx.select().from(t.config).where(eq(t.config.empresaId, req.user.empresaId));
      return cfg;
    });
  });

  app.patch("/config", async (req) => {
    const i = configInput.parse(req.body);
    return withEmpresa(req.user.empresaId, async (tx) => {
      const [cfg] = await tx
        .update(t.config)
        .set({ rendaBase: i.rendaBase.toFixed(2) })
        .where(eq(t.config.empresaId, req.user.empresaId))
        .returning();
      return cfg;
    });
  });
}
