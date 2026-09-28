import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { ok: true };
  });
}
