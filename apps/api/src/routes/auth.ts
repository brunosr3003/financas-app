import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { loginInput, registerInput } from "@financas/shared";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";
import { env } from "../env.js";

// Conjunto inicial de baldes da spec (RN-01)
const BALDES_INICIAIS = [
  { nome: "Necessidades", pct: "50", cor: "#4f6df5", descricao: "Moradia, mercado, transporte, saude e contas fixas" },
  { nome: "Construcao de reserva", pct: "20", cor: "#22a06b", descricao: "Aportes para reservas e investimentos" },
  { nome: "Doacao", pct: "10", cor: "#e2a03f", descricao: "Doacoes e caridade" },
  { nome: "Viagens", pct: "10", cor: "#9a5cf5", descricao: "Viagens e passeios" },
  { nome: "Lazer", pct: "7", cor: "#e25563", descricao: "Restaurantes, streaming, hobbies" },
  { nome: "Desenv. pessoal e financeiro", pct: "3", cor: "#38aecc", descricao: "Cursos, livros, educacao" },
];

export async function authRoutes(app: FastifyInstance) {
  // Teto agressivo nos endpoints de credencial (forca-bruta)
  const limiteAuth = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/auth/register", limiteAuth, async (req, reply) => {
    const input = registerInput.parse(req.body);

    // Registro fechado: exige codigo quando CODIGO_REGISTRO esta definido (prod)
    if (env.CODIGO_REGISTRO) {
      const { codigo } = (req.body ?? {}) as { codigo?: string };
      if (codigo !== env.CODIGO_REGISTRO) return reply.forbidden("Codigo de registro invalido");
    }

    const jaExiste = await db.select({ id: t.usuario.id }).from(t.usuario).where(eq(t.usuario.email, input.email));
    if (jaExiste.length > 0) return reply.conflict("Email ja cadastrado");

    const [novoUsuario] = await db
      .insert(t.usuario)
      .values({ nome: input.nome, email: input.email, telefone: input.telefone, senhaHash: hashPassword(input.senha) })
      .returning();
    const [novaEmpresa] = await db.insert(t.empresa).values({ nome: input.empresaNome ?? input.nome }).returning();
    if (!novoUsuario || !novaEmpresa) throw new Error("falha ao criar usuario/empresa");

    await db.insert(t.membroEmpresa).values({
      empresaId: novaEmpresa.id,
      usuarioId: novoUsuario.id,
      papel: "proprietario",
    });

    await withEmpresa(novaEmpresa.id, async (tx) => {
      await tx.insert(t.config).values({ empresaId: novaEmpresa.id });
      await tx.insert(t.balde).values(BALDES_INICIAIS.map((b) => ({ ...b, empresaId: novaEmpresa.id })));
      await tx.insert(t.auditLog).values({
        empresaId: novaEmpresa.id,
        usuarioId: novoUsuario.id,
        acao: "auth.register",
        ip: req.ip,
      });
    });

    const token = await reply.jwtSign(
      { sub: novoUsuario.id, empresaId: novaEmpresa.id, papel: "proprietario", email: novoUsuario.email },
      { expiresIn: "7d" },
    );
    return reply.code(201).send({ token, empresa: novaEmpresa, usuario: { id: novoUsuario.id, nome: novoUsuario.nome } });
  });

  app.post("/auth/login", limiteAuth, async (req, reply) => {
    const input = loginInput.parse(req.body);

    const [u] = await db.select().from(t.usuario).where(eq(t.usuario.email, input.email));
    if (!u || !verifyPassword(input.senha, u.senhaHash)) {
      return reply.unauthorized("Credenciais invalidas");
    }

    const membros = await db
      .select({ empresaId: t.membroEmpresa.empresaId, papel: t.membroEmpresa.papel, empresaNome: t.empresa.nome })
      .from(t.membroEmpresa)
      .innerJoin(t.empresa, eq(t.empresa.id, t.membroEmpresa.empresaId))
      .where(eq(t.membroEmpresa.usuarioId, u.id));
    if (membros.length === 0) return reply.forbidden("Usuario sem empresa");

    const escolhido = input.empresaId ? membros.find((m) => m.empresaId === input.empresaId) : membros[0];
    if (!escolhido) return reply.forbidden("Usuario nao pertence a esta empresa");

    await withEmpresa(escolhido.empresaId, (tx) =>
      tx.insert(t.auditLog).values({
        empresaId: escolhido.empresaId,
        usuarioId: u.id,
        acao: "auth.login",
        ip: req.ip,
      }),
    );

    const token = await reply.jwtSign(
      { sub: u.id, empresaId: escolhido.empresaId, papel: escolhido.papel, email: u.email },
      { expiresIn: "7d" },
    );
    return {
      token,
      empresas: membros.map((m) => ({ id: m.empresaId, nome: m.empresaNome, papel: m.papel })),
    };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    const [e] = await db
      .select({ ativa: t.empresa.assinaturaAtiva, nome: t.empresa.nome })
      .from(t.empresa)
      .where(eq(t.empresa.id, req.user.empresaId));
    return { usuario: req.user, empresa: { nome: e?.nome, assinaturaAtiva: e?.ativa ?? false } };
  });

  // Config publica para o front decidir se mostra o botao Google
  app.get("/auth/google/config", async () => ({ clientId: env.GOOGLE_CLIENT_ID || null }));

  /**
   * Login com Google (Identity Services): o front envia o ID token (credential),
   * o backend valida na Google e emite o JWT proprio. Usuario novo = empresa nova
   * INATIVA (assinatura) — ativada depois no painel admin.
   */
  app.post("/auth/google", limiteAuth, async (req, reply) => {
    if (!env.GOOGLE_CLIENT_ID) return reply.notImplemented("Login Google nao configurado");
    const { credential } = (req.body ?? {}) as { credential?: string };
    if (!credential) return reply.badRequest("credential ausente");

    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!resp.ok) return reply.unauthorized("Token Google invalido");
    const info = (await resp.json()) as { aud?: string; sub?: string; email?: string; email_verified?: string; name?: string };
    if (info.aud !== env.GOOGLE_CLIENT_ID || !info.sub || !info.email || info.email_verified !== "true") {
      return reply.unauthorized("Token Google invalido");
    }

    let [u] = await db.select().from(t.usuario).where(eq(t.usuario.googleSub, info.sub));
    if (!u) {
      // Vincula por email se a conta ja existia com senha
      [u] = await db.select().from(t.usuario).where(eq(t.usuario.email, info.email));
      if (u) {
        [u] = await db.update(t.usuario).set({ googleSub: info.sub }).where(eq(t.usuario.id, u.id)).returning();
      }
    }

    if (!u) {
      // Primeiro acesso: cria usuario + empresa inativa com os baldes iniciais
      [u] = await db
        .insert(t.usuario)
        .values({
          nome: info.name ?? info.email,
          email: info.email,
          googleSub: info.sub,
          senhaHash: hashPassword(randomUUID()),
        })
        .returning();
      const [novaEmpresa] = await db.insert(t.empresa).values({ nome: info.name ?? info.email }).returning();
      if (!u || !novaEmpresa) throw new Error("falha ao criar usuario Google");
      await db.insert(t.membroEmpresa).values({ empresaId: novaEmpresa.id, usuarioId: u.id, papel: "proprietario" });
      await withEmpresa(novaEmpresa.id, async (tx) => {
        await tx.insert(t.config).values({ empresaId: novaEmpresa.id });
        await tx.insert(t.balde).values(BALDES_INICIAIS.map((b) => ({ ...b, empresaId: novaEmpresa.id })));
        await tx.insert(t.auditLog).values({ empresaId: novaEmpresa.id, usuarioId: u!.id, acao: "auth.google.register", ip: req.ip });
      });
    }

    const membros = await db
      .select({ empresaId: t.membroEmpresa.empresaId, papel: t.membroEmpresa.papel, empresaNome: t.empresa.nome })
      .from(t.membroEmpresa)
      .innerJoin(t.empresa, eq(t.empresa.id, t.membroEmpresa.empresaId))
      .where(eq(t.membroEmpresa.usuarioId, u.id));
    const escolhido = membros[0];
    if (!escolhido) return reply.forbidden("Usuario sem empresa");

    const token = await reply.jwtSign(
      { sub: u.id, empresaId: escolhido.empresaId, papel: escolhido.papel, email: u.email },
      { expiresIn: "7d" },
    );
    return { token, empresas: membros.map((m) => ({ id: m.empresaId, nome: m.empresaNome, papel: m.papel })) };
  });
}
