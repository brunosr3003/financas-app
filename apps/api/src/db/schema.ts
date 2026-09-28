import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const papelEnum = pgEnum("papel", ["proprietario", "membro"]);
export const tipoTransacaoEnum = pgEnum("tipo_transacao", ["entrada", "saida", "transferencia"]);
export const origemEnum = pgEnum("origem_transacao", ["conta", "cartao"]);
export const formaEnum = pgEnum("forma_pagamento", ["pix", "debito", "transferencia", "boleto", "dinheiro"]);
export const statusFaturaEnum = pgEnum("status_fatura", ["aberta", "fechada", "paga"]);
export const statusPagamentoProjetoEnum = pgEnum("status_pagamento_projeto", ["agendado", "pago"]);
export const tipoProvisaoEnum = pgEnum("tipo_provisao", ["entrada", "saida"]);
export const recorrenciaEnum = pgEnum("recorrencia", ["mensal", "trimestral", "semestral", "anual", "unica"]);
export const tipoValorEnum = pgEnum("tipo_valor", ["fixo", "variavel"]);
export const amortizacaoEnum = pgEnum("sistema_amortizacao", ["sac", "price"]);
export const tipoMovAplicacaoEnum = pgEnum("tipo_mov_aplicacao", ["rendimento", "custo"]);

const dinheiro = (name: string) => numeric(name, { precision: 14, scale: 2 });

// ---------------------------------------------------------------------------
// Diretorio (RLS DESLIGADA — consultadas antes do contexto de empresa existir)
// ---------------------------------------------------------------------------
export const empresa = pgTable("empresa", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  // Assinatura: empresa nasce inativa e so acessa dados apos ativacao (painel admin)
  assinaturaAtiva: boolean("assinatura_ativa").notNull().default(false),
  assinaturaEm: timestamp("assinatura_em", { withTimezone: true }),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
});

export const usuario = pgTable("usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  telefone: text("telefone"),
  senhaHash: text("senha_hash").notNull(),
  googleSub: text("google_sub").unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const membroEmpresa = pgTable(
  "membro_empresa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
    usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
    papel: papelEnum("papel").notNull().default("membro"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membro_unico").on(t.empresaId, t.usuarioId)],
);

// ---------------------------------------------------------------------------
// Escopadas por empresa (RLS LIGADA via app.empresa_id)
// ---------------------------------------------------------------------------
export const config = pgTable("config", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id).unique(),
  rendaBase: dinheiro("renda_base").notNull().default("0"),
});

export const conta = pgTable("conta", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  banco: text("banco").notNull(),
  saldoInicial: dinheiro("saldo_inicial").notNull().default("0"),
  dataSaldoInicial: date("data_saldo_inicial").notNull(),
  cor: text("cor").notNull().default("#4f6df5"),
  arquivada: boolean("arquivada").notNull().default(false),
});

export const cartao = pgTable("cartao", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  limite: dinheiro("limite").notNull(),
  diaFechamento: integer("dia_fechamento").notNull(),
  diaVencimento: integer("dia_vencimento").notNull(),
  arquivado: boolean("arquivado").notNull().default(false),
});

export const fatura = pgTable("fatura", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  cartaoId: uuid("cartao_id").notNull().references(() => cartao.id),
  cicloInicio: date("ciclo_inicio").notNull(),
  cicloFim: date("ciclo_fim").notNull(),
  vencimento: date("vencimento").notNull(),
  status: statusFaturaEnum("status").notNull().default("aberta"),
  // RN-15: fatura paga que recebeu lancamento retroativo
  ajustada: boolean("ajustada").notNull().default(false),
  valorPago: dinheiro("valor_pago").notNull().default("0"),
});

export const balde = pgTable("balde", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  pct: numeric("pct", { precision: 5, scale: 2 }).notNull(),
  descricao: text("descricao"),
  cor: text("cor").notNull().default("#4f6df5"),
});

export const projeto = pgTable("projeto", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  budgetTotal: dinheiro("budget_total").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  arquivado: boolean("arquivado").notNull().default(false),
});

export const etapaProjeto = pgTable("etapa_projeto", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  projetoId: uuid("projeto_id").notNull().references(() => projeto.id),
  nome: text("nome").notNull(),
  budget: dinheiro("budget").notNull(),
});

export const parcelamento = pgTable("parcelamento", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  cartaoId: uuid("cartao_id").notNull().references(() => cartao.id),
  descricao: text("descricao").notNull(),
  valorTotal: dinheiro("valor_total").notNull(),
  parcelasTotal: integer("parcelas_total").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const transacao = pgTable("transacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  tipo: tipoTransacaoEnum("tipo").notNull(),
  origem: origemEnum("origem").notNull(),
  contaId: uuid("conta_id").references(() => conta.id),
  contaDestinoId: uuid("conta_destino_id").references(() => conta.id),
  cartaoId: uuid("cartao_id").references(() => cartao.id),
  faturaId: uuid("fatura_id").references(() => fatura.id),
  descricao: text("descricao").notNull(),
  valor: dinheiro("valor").notNull(),
  data: date("data").notNull(),
  baldeId: uuid("balde_id").references(() => balde.id),
  projetoId: uuid("projeto_id").references(() => projeto.id),
  etapaId: uuid("etapa_id").references(() => etapaProjeto.id),
  forma: formaEnum("forma"),
  parcelamentoId: uuid("parcelamento_id").references(() => parcelamento.id),
  parcelaNum: integer("parcela_num"),
  parcelaTotal: integer("parcela_total"),
  retroativa: boolean("retroativa").notNull().default(false),
  // Lancamentos vindos do MCP/importacao aguardando confirmacao do usuario
  pendente: boolean("pendente").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const provisao = pgTable("provisao", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  tipo: tipoProvisaoEnum("tipo").notNull(),
  valor: dinheiro("valor"),
  dia: integer("dia"),
  mesVencimento: integer("mes_vencimento"),
  recorrencia: recorrenciaEnum("recorrencia").notNull().default("mensal"),
  contaId: uuid("conta_id").references(() => conta.id),
  baldeId: uuid("balde_id").references(() => balde.id),
  projetoId: uuid("projeto_id").references(() => projeto.id),
  faturaId: uuid("fatura_id").references(() => fatura.id),
  automatica: boolean("automatica").notNull().default(false),
  tipoValor: tipoValorEnum("tipo_valor"),
  diaConferencia: integer("dia_conferencia"),
  ativa: boolean("ativa").notNull().default(true),
});

export const credito = pgTable("credito", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  banco: text("banco").notNull(),
  sistema: amortizacaoEnum("sistema").notNull(),
  taxaMes: numeric("taxa_mes", { precision: 7, scale: 4 }).notNull(),
  principal: dinheiro("principal").notNull(),
  inicio: date("inicio").notNull(),
  fim: date("fim").notNull(),
  diaVencimento: integer("dia_vencimento").notNull(),
  contaId: uuid("conta_id").references(() => conta.id),
  ativa: boolean("ativa").notNull().default(true),
});

export const reserva = pgTable("reserva", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  nome: text("nome").notNull(),
  meta: dinheiro("meta").notNull().default("0"),
});

export const aplicacao = pgTable("aplicacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  reservaId: uuid("reserva_id").notNull().references(() => reserva.id),
  instituicao: text("instituicao").notNull(),
  produto: text("produto").notNull(),
  valorAtual: dinheiro("valor_atual").notNull().default("0"),
});

export const movimentoAplicacao = pgTable("movimento_aplicacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  aplicacaoId: uuid("aplicacao_id").notNull().references(() => aplicacao.id),
  tipo: tipoMovAplicacaoEnum("tipo").notNull(),
  valor: dinheiro("valor").notNull(),
  data: date("data").notNull(),
});

export const pagamentoProjeto = pgTable("pagamento_projeto", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  projetoId: uuid("projeto_id").notNull().references(() => projeto.id),
  etapaId: uuid("etapa_id").references(() => etapaProjeto.id),
  descricao: text("descricao").notNull(),
  valor: dinheiro("valor").notNull(),
  dataPrevista: date("data_prevista").notNull(),
  contaId: uuid("conta_id").notNull().references(() => conta.id),
  status: statusPagamentoProjetoEnum("status").notNull().default("agendado"),
  dataPagamento: date("data_pagamento"),
  transacaoId: uuid("transacao_id").references(() => transacao.id),
  ativa: boolean("ativa").notNull().default(true),
});

// Token de conexao do MCP remoto (claude.ai): guarda apenas o hash.
// Tabela de diretorio (RLS off): o lookup acontece antes do contexto de empresa.
export const tokenConexao = pgTable("token_conexao", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuario.id),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  tokenHash: text("token_hash").notNull().unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  ultimoUso: timestamp("ultimo_uso", { withTimezone: true }),
});

// Trilha de auditoria (LGPD: accountability — quem fez o que e quando)
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresaId: uuid("empresa_id").notNull().references(() => empresa.id),
  usuarioId: uuid("usuario_id"),
  acao: text("acao").notNull(),
  entidade: text("entidade"),
  entidadeId: uuid("entidade_id"),
  dados: jsonb("dados"),
  ip: text("ip"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Fonte unica para o apply-rls: toda tabela escopada tem coluna empresa_id
// ---------------------------------------------------------------------------
export const tabelasDiretorio = ["empresa", "usuario", "membro_empresa", "token_conexao"] as const;
export const tabelasEscopadas = [
  "config",
  "conta",
  "cartao",
  "fatura",
  "balde",
  "projeto",
  "etapa_projeto",
  "parcelamento",
  "transacao",
  "provisao",
  "credito",
  "reserva",
  "aplicacao",
  "movimento_aplicacao",
  "pagamento_projeto",
  "audit_log",
] as const;
