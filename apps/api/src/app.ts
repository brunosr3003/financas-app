import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { ZodError } from "zod";
import authPlugin from "./plugins/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { cadastrosRoutes } from "./routes/cadastros.js";
import { dfcRoutes } from "./routes/dfc.js";
import { eventosRoutes } from "./routes/eventos.js";
import { exportacaoRoutes } from "./routes/exportacao.js";
import { publicar } from "./tempo-real/eventos.js";
import { healthRoutes } from "./routes/health.js";
import { mcpRoutes } from "./routes/mcp.js";
import { membrosRoutes } from "./routes/membros.js";
import { projetosRoutes } from "./routes/projetos.js";
import { provisoesRoutes } from "./routes/provisoes.js";
import { reservasRoutes } from "./routes/reservas.js";
import { resumoRoutes } from "./routes/resumo.js";
import { transacoesRoutes } from "./routes/transacoes.js";

export async function buildApp() {
  const app = Fastify({ logger: { transport: { target: "pino-pretty" } } });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  // Protecao basica contra forca-bruta/abuso; /auth/* tem teto proprio abaixo
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin);

  // Antes das rotas: contextos encapsulados herdam o error handler no register
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError || (err as { name?: string }).name === "ZodError") {
      return reply.code(422).send({ error: "validacao", issues: (err as unknown as ZodError).issues });
    }
    const erro = err as { statusCode?: number; message?: string };
    const status = erro.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: erro.message ?? "erro interno" });
  });

  // Toda mutacao bem-sucedida de um usuario logado publica no canal de tempo
  // real da empresa (inclui as chamadas do MCP, que passam por inject)
  app.addHook("onSend", async (req, reply, payload) => {
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
      reply.statusCode < 400 &&
      req.user?.empresaId &&
      !req.url.startsWith("/auth/") &&
      !req.url.startsWith("/admin/")
    ) {
      publicar(req.user.empresaId, { tipo: "dados", rota: req.url, em: new Date().toISOString() });
    }
    return payload;
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(membrosRoutes);
  await app.register(cadastrosRoutes);
  await app.register(transacoesRoutes);
  await app.register(dfcRoutes);
  await app.register(resumoRoutes);
  await app.register(projetosRoutes);
  await app.register(provisoesRoutes);
  await app.register(reservasRoutes);
  await app.register(exportacaoRoutes);
  await app.register(mcpRoutes);
  await app.register(eventosRoutes);

  return app;
}
