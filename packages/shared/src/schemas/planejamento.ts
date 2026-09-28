import { z } from "zod";

const num = z.number().finite();
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const criarProvisaoInput = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["entrada", "saida"]),
  valor: num.positive().nullable().optional(),
  dia: z.number().int().min(1).max(31).optional(),
  mesVencimento: z.number().int().min(1).max(12).optional(),
  recorrencia: z.enum(["mensal", "trimestral", "semestral", "anual", "unica"]).default("mensal"),
  contaId: z.string().uuid().optional(),
  baldeId: z.string().uuid().optional(),
  projetoId: z.string().uuid().optional(),
  tipoValor: z.enum(["fixo", "variavel"]).optional(),
  diaConferencia: z.number().int().min(1).max(31).optional(),
  ativa: z.boolean().default(true),
});
export const atualizarProvisaoInput = criarProvisaoInput.partial();

export const criarCreditoInput = z.object({
  nome: z.string().min(1),
  banco: z.string().min(1),
  sistema: z.enum(["sac", "price"]),
  taxaMes: num.min(0),
  principal: num.positive(),
  inicio: z.string().regex(/^\d{4}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}$/),
  diaVencimento: z.number().int().min(1).max(31),
  contaId: z.string().uuid().optional(),
});
export const atualizarCreditoInput = criarCreditoInput.partial().extend({
  ativa: z.boolean().optional(),
});

export const criarProjetoInput = z.object({
  nome: z.string().min(1),
  budgetTotal: num.positive(),
});
export const atualizarProjetoInput = z.object({
  nome: z.string().min(1).optional(),
  budgetTotal: num.positive().optional(),
  ativo: z.boolean().optional(),
  arquivado: z.boolean().optional(),
});

export const criarEtapaInput = z.object({
  nome: z.string().min(1),
  budget: num.positive(),
});

export const criarPagamentoProjetoInput = z.object({
  descricao: z.string().min(1),
  valor: num.positive(),
  dataPrevista: dataISO,
  etapaId: z.string().uuid().optional(),
  contaId: z.string().uuid(),
  jaPago: z.boolean().default(false),
});

export const criarReservaInput = z.object({
  nome: z.string().min(1),
  meta: num.min(0).default(0),
});

export const criarAplicacaoInput = z.object({
  instituicao: z.string().min(1),
  produto: z.string().min(1),
  valorAtual: num.min(0).default(0),
});

export const movimentoAplicacaoInput = z.object({
  tipo: z.enum(["rendimento", "custo"]),
  valor: num.positive(),
  data: dataISO,
});
