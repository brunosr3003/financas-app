import type { FastifyInstance } from "fastify";
import { registrarCliente, removerCliente } from "../tempo-real/eventos.js";

export async function eventosRoutes(app: FastifyInstance) {
  // Stream SSE autenticado (o front conecta via fetch com Authorization)
  app.get("/eventos", { preHandler: [app.authenticate] }, async (req, reply) => {
    const empresaId = req.user.empresaId;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(": conectado\n\n");
    registrarCliente(empresaId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": hb\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      removerCliente(empresaId, res);
    });
  });
}
