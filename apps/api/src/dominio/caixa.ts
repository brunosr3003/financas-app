/**
 * Linhas de CAIXA (RN-10/14): movimentos de conta — entradas, saidas e
 * transferencias (uma linha por conta afetada). Compras de cartao NAO sao caixa.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import * as t from "../db/schema.js";
import type { Tx } from "../db/with-empresa.js";
import { dec } from "../seguranca/crypto.js";

export interface LinhaCaixa {
  data: string;
  historico: string;
  tipo: "entrada" | "saida";
  valor: number;
  contaId: string;
  transacaoId: string;
}

export async function linhasCaixaAte(tx: Tx, empresaId: string, ateData: string): Promise<LinhaCaixa[]> {
  const movs = await tx
    .select()
    .from(t.transacao)
    .where(
      and(
        eq(t.transacao.empresaId, empresaId),
        eq(t.transacao.origem, "conta"),
        eq(t.transacao.pendente, false),
        lte(t.transacao.data, ateData),
      ),
    )
    .orderBy(asc(t.transacao.data), asc(t.transacao.criadoEm));

  const linhas: LinhaCaixa[] = [];
  for (const m of movs) {
    if (m.tipo === "transferencia") {
      if (m.contaId)
        linhas.push({ data: m.data, historico: dec(m.descricao), tipo: "saida", valor: Number(m.valor), contaId: m.contaId, transacaoId: m.id });
      if (m.contaDestinoId)
        linhas.push({ data: m.data, historico: dec(m.descricao), tipo: "entrada", valor: Number(m.valor), contaId: m.contaDestinoId, transacaoId: m.id });
      continue;
    }
    if (m.contaId) {
      linhas.push({ data: m.data, historico: dec(m.descricao), tipo: m.tipo, valor: Number(m.valor), contaId: m.contaId, transacaoId: m.id });
    }
  }
  return linhas;
}

type Conta = typeof t.conta.$inferSelect;

/** Saldo consolidado das contas selecionadas na data (saldo inicial + movimentos). */
export function saldoAte(contas: Conta[], linhas: LinhaCaixa[], ateData: string, selecao: string[] | null): number {
  const ids = selecao && selecao.length > 0 ? new Set(selecao) : null;
  let saldo = 0;
  for (const c of contas) {
    if (ids && !ids.has(c.id)) continue;
    if (c.dataSaldoInicial <= ateData) saldo += Number(c.saldoInicial);
  }
  for (const l of linhas) {
    if (l.data > ateData) continue;
    if (ids && !ids.has(l.contaId)) continue;
    saldo += l.tipo === "entrada" ? l.valor : -l.valor;
  }
  return Math.round(saldo * 100) / 100;
}
