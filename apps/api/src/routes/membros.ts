import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { convidarMembroInput } from "@financas/shared";
import { hashPassword } from "../auth/password.js";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";

export async function membrosRoutes(app: FastifyInstance) {
  app.get("/membros", { preHandler: [app.authenticate] }, async (req) => {
    return db
      .select({ id: t.membroEmpresa.id, papel: t.membroEmpresa.papel, nome: t.usuario.nome, email: t.usuario.email })
      .from(t.membroEmpresa)
      .innerJoin(t.usuario, eq(t.usuario.id, t.membroEmpresa.usuarioId))
      .where(eq(t.membroEmpresa.empresaId, req.user.empresaId));
  });

  // Somente o proprietario adiciona membros a empresa
  app.post("/membros", { preHandler: [app.authorize(["proprietario"])] }, async (req, reply) => {
    const input = convidarMembroInput.parse(req.body);

    let [u] = await db.select().from(t.usuario).where(eq(t.usuario.email, input.email));
    if (!u) {
      [u] = await db
        .insert(t.usuario)
        .values({ nome: input.nome, email: input.email, senhaHash: hashPassword(input.senha) })
        .returning();
    }
    if (!u) throw new Error("falha ao criar usuario");

    const [membro] = await db
      .insert(t.membroEmpresa)
      .values({ empresaId: req.user.empresaId, usuarioId: u.id, papel: input.papel })
      .onConflictDoNothing()
      .returning();
    if (!membro) return reply.conflict("Usuario ja e membro desta empresa");
    return reply.code(201).send(membro);
  });
}
