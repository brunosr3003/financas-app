import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./client.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<any, any, any>;

/**
 * Abre uma transacao com app.empresa_id setado (SET LOCAL): as policies de RLS
 * limitam toda query dentro de `fn` aos dados da empresa.
 */
export async function withEmpresa<T>(empresaId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.empresa_id', ${empresaId}, true)`);
    return fn(tx);
  });
}
