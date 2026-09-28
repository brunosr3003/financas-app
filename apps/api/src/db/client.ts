import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

// Role da aplicacao: NOSUPERUSER NOBYPASSRLS — RLS aplicada em toda query.
const appClient = postgres(env.APP_DATABASE_URL, { max: 10 });
export const db = drizzle(appClient, { schema });

// Superuser: bypassa RLS. Uso exclusivo de operacoes de sistema (seed, jobs cross-empresa).
const adminClient = postgres(env.DATABASE_URL, { max: 4 });
export const adminDb = drizzle(adminClient, { schema });
