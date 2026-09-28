/**
 * MCP remoto (Streamable HTTP, stateless) para conectores do claude.ai.
 * URL: POST /mcp/:token — o token identifica usuario+empresa (hash no banco).
 * Cada request valida o token, emite um JWT curto e injeta as chamadas na
 * propria API (fastify inject), herdando RLS, gate de assinatura e auditoria.
 */
import { createHash, randomBytes } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { criarServidorMcp, type ChamarApi } from "../mcp/servidor.js";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function mcpRoutes(app: FastifyInstance) {
  // --- Gestao do token de conexao (dentro do app, autenticado) --------------
  app.post("/auth/token-mcp", { preHandler: [app.authenticate] }, async (req) => {
    const token = `cofre_${randomBytes(24).toString("hex")}`;
    await db
      .delete(t.tokenConexao)
      .where(eq(t.tokenConexao.usuarioId, req.user.sub));
    await db.insert(t.tokenConexao).values({
      usuarioId: req.user.sub,
      empresaId: req.user.empresaId,
      tokenHash: hash(token),
    });
    return { token, url: `https://cofre.grupomultiluz.com.br/api/mcp/${token}` };
  });

  app.delete("/auth/token-mcp", { preHandler: [app.authenticate] }, async (req) => {
    await db.delete(t.tokenConexao).where(eq(t.tokenConexao.usuarioId, req.user.sub));
    return { ok: true };
  });

  // --- Endpoint MCP ---------------------------------------------------------
  app.post("/mcp/:token", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const [registro] = await db
      .select()
      .from(t.tokenConexao)
      .where(eq(t.tokenConexao.tokenHash, hash(token)));
    if (!registro) return reply.unauthorized("Token de conexao invalido — gere um novo no app (aba Ajuda)");

    const [u] = await db.select().from(t.usuario).where(eq(t.usuario.id, registro.usuarioId));
    const [m] = await db
      .select()
      .from(t.membroEmpresa)
      .where(eq(t.membroEmpresa.usuarioId, registro.usuarioId));
    if (!u || !m) return reply.unauthorized("Usuario do token nao existe mais");

    void db
      .update(t.tokenConexao)
      .set({ ultimoUso: new Date() })
      .where(eq(t.tokenConexao.id, registro.id))
      .then(() => undefined, () => undefined);

    const jwt = app.jwt.sign(
      { sub: u.id, empresaId: registro.empresaId, papel: m.papel, email: u.email },
      { expiresIn: "10m" },
    );

    const chamar: ChamarApi = async (metodo, rota, corpo) => {
      const res = await app.inject({
        method: metodo as "GET",
        url: rota,
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        payload: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      const json = res.json() as { message?: string; error?: string; issues?: unknown };
      if (res.statusCode >= 400) {
        throw new Error(
          `${metodo} ${rota} -> ${res.statusCode}: ${json.message ?? json.error ?? "erro"}${json.issues ? " " + JSON.stringify(json.issues) : ""}`,
        );
      }
      return json as never;
    };

    const server = criarServidorMcp(chamar);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true, // resposta JSON pura — sem SSE, sem buffering de proxy
    });
    await server.connect(transport);

    reply.hijack();
    await transport.handleRequest(req.raw, reply.raw, req.body);
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
  });

  // Stateless: GET (stream de notificacoes) e DELETE (sessao) nao se aplicam
  const naoSuportado = async (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.code(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (servidor stateless)" },
      id: null,
    });
  app.get("/mcp/:token", naoSuportado);
  app.delete("/mcp/:token", naoSuportado);
}
