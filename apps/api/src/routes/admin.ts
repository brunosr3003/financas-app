import type { FastifyInstance } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import { adminDb } from "../db/client.js";
import * as t from "../db/schema.js";
import { env } from "../env.js";
import { limparCacheAssinatura } from "../plugins/auth.js";

/**
 * Painel de gestao de assinaturas (subdominio proprio). Autenticacao por
 * x-admin-key (ADMIN_KEY no .env) — rotas desligadas quando a chave nao existe.
 * Usa adminDb (bypass RLS): visao cross-empresa e exclusiva daqui.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    if (!env.ADMIN_KEY) return reply.notFound();
    const chave = req.headers["x-admin-key"];
    if (chave !== env.ADMIN_KEY) return reply.unauthorized("Chave admin invalida");
  });

  app.get("/admin/empresas", async () => {
    const empresas = await adminDb
      .select({
        id: t.empresa.id,
        nome: t.empresa.nome,
        assinaturaAtiva: t.empresa.assinaturaAtiva,
        assinaturaEm: t.empresa.assinaturaEm,
        criadaEm: t.empresa.criadaEm,
        dono: sql<string>`(
          select u.email from membro_empresa m
          join usuario u on u.id = m.usuario_id
          where m.empresa_id = empresa.id and m.papel = 'proprietario'
          order by m.criado_em limit 1
        )`,
        membros: sql<number>`(select count(*)::int from membro_empresa m where m.empresa_id = empresa.id)`,
        transacoes: sql<number>`(select count(*)::int from transacao x where x.empresa_id = empresa.id)`,
      })
      .from(t.empresa)
      .orderBy(desc(t.empresa.criadaEm));
    return empresas;
  });

  app.post("/admin/empresas/:id/assinatura", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { ativa } = (req.body ?? {}) as { ativa?: boolean };
    if (typeof ativa !== "boolean") return reply.badRequest("ativa deve ser boolean");

    const [e] = await adminDb
      .update(t.empresa)
      .set({ assinaturaAtiva: ativa, assinaturaEm: ativa ? new Date() : null })
      .where(eq(t.empresa.id, id))
      .returning();
    if (!e) return reply.notFound("Empresa nao encontrada");

    limparCacheAssinatura(id);
    await adminDb.insert(t.auditLog).values({
      empresaId: id,
      acao: ativa ? "assinatura.ativar" : "assinatura.desativar",
      entidade: "empresa",
      entidadeId: id,
      ip: req.ip,
    });
    return e;
  });
}
