import jwt from "@fastify/jwt";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { Papel } from "@financas/shared";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { env } from "../env.js";

// Cache curto do status de assinatura para nao consultar a cada request
const cacheAssinatura = new Map<string, { ativa: boolean; ate: number }>();

export function limparCacheAssinatura(empresaId?: string) {
  if (empresaId) cacheAssinatura.delete(empresaId);
  else cacheAssinatura.clear();
}

async function assinaturaAtiva(empresaId: string): Promise<boolean> {
  const memo = cacheAssinatura.get(empresaId);
  if (memo && memo.ate > Date.now()) return memo.ativa;
  const [e] = await db.select({ ativa: t.empresa.assinaturaAtiva }).from(t.empresa).where(eq(t.empresa.id, empresaId));
  const ativa = e?.ativa ?? false;
  cacheAssinatura.set(empresaId, { ativa, ate: Date.now() + 30_000 });
  return ativa;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; empresaId: string; papel: Papel; email: string };
    user: { sub: string; empresaId: string; papel: Papel; email: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (papeis: Papel[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    await req.jwtVerify();
    // Gate de assinatura: empresa inativa nao acessa dados (402), mas /auth/* passa
    if (!req.url.startsWith("/auth/") && !(await assinaturaAtiva(req.user.empresaId))) {
      return reply.code(402).send({ error: "assinatura_inativa", message: "Assinatura aguardando ativacao" });
    }
  });

  app.decorate("authorize", (papeis: Papel[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      await req.jwtVerify();
      if (!papeis.includes(req.user.papel)) {
        return reply.forbidden("Sem permissao para esta operacao");
      }
    };
  });
});
