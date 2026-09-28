import { z } from "zod";

const decimalStr = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .refine((v) => Number.isFinite(v), "valor invalido");

export const criarContaInput = z.object({
  nome: z.string().min(1),
  banco: z.string().min(1),
  saldoInicial: decimalStr,
  dataSaldoInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cor: z.string().default("#4f6df5"),
});
export type CriarContaInput = z.infer<typeof criarContaInput>;

export const atualizarContaInput = criarContaInput.partial().extend({
  arquivada: z.boolean().optional(),
});

export const criarCartaoInput = z.object({
  nome: z.string().min(1),
  limite: decimalStr,
  diaFechamento: z.number().int().min(1).max(31),
  diaVencimento: z.number().int().min(1).max(31),
});
export type CriarCartaoInput = z.infer<typeof criarCartaoInput>;

export const atualizarCartaoInput = criarCartaoInput.partial().extend({
  arquivado: z.boolean().optional(),
});

export const criarBaldeInput = z.object({
  nome: z.string().min(1),
  pct: decimalStr,
  descricao: z.string().optional(),
  cor: z.string().default("#4f6df5"),
});
export type CriarBaldeInput = z.infer<typeof criarBaldeInput>;

export const atualizarBaldeInput = criarBaldeInput.partial();

export const configInput = z.object({
  rendaBase: decimalStr,
});
