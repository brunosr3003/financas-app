/**
 * Aplica RLS: cria a role da app (sem bypass), grants e policies por empresa_id.
 * Roda como superuser, DEPOIS do db:push. Idempotente — re-rode apos criar tabelas novas.
 */
import postgres from "postgres";
import { env } from "../env.js";
import { tabelasDiretorio, tabelasEscopadas } from "./schema.js";

const url = new URL(env.APP_DATABASE_URL);
const appUser = decodeURIComponent(url.username);
const appPass = decodeURIComponent(url.password);

const sql = postgres(env.DATABASE_URL, { max: 1 });

const exists = await sql`select 1 from pg_roles where rolname = ${appUser}`;
if (exists.length === 0) {
  await sql.unsafe(
    `CREATE ROLE ${appUser} LOGIN PASSWORD '${appPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
  );
  console.log(`role ${appUser} criada`);
}

await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${appUser}`);
await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser}`);
await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser}`);
await sql.unsafe(
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`,
);

for (const t of tabelasDiretorio) {
  await sql.unsafe(`ALTER TABLE "${t}" DISABLE ROW LEVEL SECURITY`);
}

for (const t of tabelasEscopadas) {
  await sql.unsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
  await sql.unsafe(`DROP POLICY IF EXISTS empresa_isolation ON "${t}"`);
  await sql.unsafe(`
    CREATE POLICY empresa_isolation ON "${t}"
      USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
      WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid)
  `);
}

console.log(`RLS aplicada: ${tabelasEscopadas.length} tabelas escopadas, ${tabelasDiretorio.length} de diretorio`);
await sql.end();
