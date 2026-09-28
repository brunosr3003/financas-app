import { z } from "zod";

export const registerInput = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(8),
  telefone: z
    .string()
    .min(10, "telefone incompleto")
    .regex(/^[\d\s()+-]+$/, "telefone invalido"),
  /** Opcional: sem informar, o espaco recebe o nome do usuario (UX de usuario unico) */
  empresaNome: z.string().min(1).optional(),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  empresaId: z.string().uuid().optional(),
});
export type LoginInput = z.infer<typeof loginInput>;

export const PAPEIS = ["proprietario", "membro"] as const;
export type Papel = (typeof PAPEIS)[number];

export const convidarMembroInput = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(8),
  papel: z.enum(PAPEIS).default("membro"),
});
export type ConvidarMembroInput = z.infer<typeof convidarMembroInput>;
