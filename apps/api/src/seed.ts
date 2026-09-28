/**
 * Seed de desenvolvimento: empresa "Pessoal" + usuario dev@financas.local / senha "financas123".
 * Roda como superuser (bypassa RLS). Idempotente.
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth/password.js";
import { adminDb } from "./db/client.js";
import * as t from "./db/schema.js";

const EMAIL = "dev@financas.local";

const [existente] = await adminDb.select().from(t.usuario).where(eq(t.usuario.email, EMAIL));
if (existente) {
  console.log("seed ja aplicado, nada a fazer");
  process.exit(0);
}

const [u] = await adminDb
  .insert(t.usuario)
  .values({ nome: "Dev", email: EMAIL, senhaHash: hashPassword("financas123") })
  .returning();
const [e] = await adminDb.insert(t.empresa).values({ nome: "Pessoal" }).returning();
if (!u || !e) throw new Error("falha no seed");

await adminDb.insert(t.membroEmpresa).values({ empresaId: e.id, usuarioId: u.id, papel: "proprietario" });
await adminDb.insert(t.config).values({ empresaId: e.id, rendaBase: "16285.60" });
await adminDb.insert(t.balde).values([
  { empresaId: e.id, nome: "Necessidades", pct: "50", cor: "#4f6df5" },
  { empresaId: e.id, nome: "Construcao de reserva", pct: "20", cor: "#22a06b" },
  { empresaId: e.id, nome: "Doacao", pct: "10", cor: "#e2a03f" },
  { empresaId: e.id, nome: "Viagens", pct: "10", cor: "#9a5cf5" },
  { empresaId: e.id, nome: "Lazer", pct: "7", cor: "#e25563" },
  { empresaId: e.id, nome: "Desenv. pessoal e financeiro", pct: "3", cor: "#38aecc" },
]);

console.log(`seed ok — empresa ${e.id}, login ${EMAIL} / financas123`);
process.exit(0);
