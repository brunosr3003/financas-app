import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  PORT: z.coerce.number().default(3400),
  /** Chave AES-256 (32 bytes em hex) para criptografia de campo */
  DATA_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "DATA_KEY deve ter 64 chars hex"),
  /** Codigo exigido no registro de novas empresas; vazio = registro aberto (so dev) */
  CODIGO_REGISTRO: z.string().default(""),
  /** OAuth client ID do Google Identity Services; vazio = botao Google oculto */
  GOOGLE_CLIENT_ID: z.string().default(""),
  /** Chave do painel admin (header x-admin-key). Vazia = rotas /admin desligadas */
  ADMIN_KEY: z.string().default(""),
});

export const env = envSchema.parse(process.env);
