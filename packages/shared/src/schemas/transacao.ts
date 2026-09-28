import { z } from "zod";

export const FORMAS = ["pix", "debito", "transferencia", "boleto", "dinheiro"] as const;

const base = {
  descricao: z.string().min(1),
  valor: z.number().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baldeId: z.string().uuid().optional(),
  projetoId: z.string().uuid().optional(),
  etapaId: z.string().uuid().optional(),
  /** Lancamentos criados via MCP/importacao entram pendentes de confirmacao */
  pendente: z.boolean().default(false),
};

export const lancamentoContaInput = z.object({
  origem: z.literal("conta"),
  tipo: z.enum(["entrada", "saida"]),
  contaId: z.string().uuid(),
  forma: z.enum(FORMAS),
  ...base,
});

export const lancamentoCartaoInput = z.object({
  origem: z.literal("cartao"),
  tipo: z.literal("saida"),
  cartaoId: z.string().uuid(),
  parcelas: z.number().int().min(1).max(24).default(1),
  /** Lancamento retroativo: fatura de destino explicita (RN-15) */
  faturaId: z.string().uuid().optional(),
  ...base,
});

export const lancamentoInput = z
  .discriminatedUnion("origem", [lancamentoContaInput, lancamentoCartaoInput])
  .refine((v) => !(v.baldeId && v.projetoId), {
    message: "balde e projeto sao excludentes (RN-02)",
  });
export type LancamentoInput = z.infer<typeof lancamentoInput>;

export const transferenciaInput = z.object({
  contaOrigemId: z.string().uuid(),
  contaDestinoId: z.string().uuid(),
  valor: z.number().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descricao: z.string().default("Transferencia entre contas"),
});
export type TransferenciaInput = z.infer<typeof transferenciaInput>;

export const pagarFaturaInput = z.object({
  contaId: z.string().uuid(),
  valor: z.number().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PagarFaturaInput = z.infer<typeof pagarFaturaInput>;
