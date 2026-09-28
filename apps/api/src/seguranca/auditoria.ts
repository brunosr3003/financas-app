import type { FastifyRequest } from "fastify";
import * as t from "../db/schema.js";
import type { Tx } from "../db/with-empresa.js";

interface Evento {
  acao: string;
  entidade?: string;
  entidadeId?: string;
  dados?: Record<string, unknown>;
}

/** Registra evento na trilha de auditoria dentro da transacao corrente. */
export async function auditar(tx: Tx, req: FastifyRequest, ev: Evento): Promise<void> {
  await tx.insert(t.auditLog).values({
    empresaId: req.user.empresaId,
    usuarioId: req.user.sub,
    acao: ev.acao,
    entidade: ev.entidade,
    entidadeId: ev.entidadeId,
    dados: ev.dados,
    ip: req.ip,
  });
}
