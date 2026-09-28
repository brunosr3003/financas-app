import { and, eq } from "drizzle-orm";
import * as t from "../db/schema.js";
import type { Tx } from "../db/with-empresa.js";

// Datas como string ISO (YYYY-MM-DD), aritmetica em UTC para nao sofrer com fuso.
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDias(iso: string, dias: number): string {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return toISO(d);
}

export function addMeses(iso: string, meses: number): string {
  const d = fromISO(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return toISO(d);
}

/** Dia N do mes de `ano/mes` (0-based), limitado ao ultimo dia do mes (31 em fevereiro → 28/29). */
function diaNoMes(ano: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(ano, mes, Math.min(dia, ultimo))));
}

export interface CicloFatura {
  cicloInicio: string;
  cicloFim: string;
  vencimento: string;
}

/**
 * Ciclo da fatura que recebe uma compra feita em `data` (RN-03): a fatura fecha
 * no primeiro dia de fechamento >= data; o ciclo comeca no dia seguinte ao
 * fechamento anterior; o vencimento e a primeira ocorrencia do dia de
 * vencimento estritamente depois do fechamento.
 */
export function cicloParaCompra(data: string, diaFechamento: number, diaVencimento: number): CicloFatura {
  const d = fromISO(data);
  let ano = d.getUTCFullYear();
  let mes = d.getUTCMonth();
  let cicloFim = diaNoMes(ano, mes, diaFechamento);
  if (data > cicloFim) {
    mes += 1;
    if (mes > 11) { mes = 0; ano += 1; }
    cicloFim = diaNoMes(ano, mes, diaFechamento);
  }
  const fimAnterior = diaNoMes(mes === 0 ? ano - 1 : ano, mes === 0 ? 11 : mes - 1, diaFechamento);
  const cicloInicio = addDias(fimAnterior, 1);

  let venc = diaNoMes(ano, mes, diaVencimento);
  if (venc <= cicloFim) {
    const prox = mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 };
    venc = diaNoMes(prox.ano, prox.mes, diaVencimento);
  }
  return { cicloInicio, cicloFim, vencimento: venc };
}

type Cartao = typeof t.cartao.$inferSelect;

/**
 * Busca a fatura do ciclo que cobre `data`; cria (aberta) se ainda nao existir.
 * Fatura paga nao recebe compra nova (RN-15) — a compra rola para o ciclo seguinte,
 * como no cartao real quando a fatura foi quitada antecipadamente.
 */
export async function faturaParaCompra(tx: Tx, cartao: Cartao, data: string) {
  let ref = data;
  for (let tentativas = 0; tentativas < 24; tentativas += 1) {
    const ciclo = cicloParaCompra(ref, cartao.diaFechamento, cartao.diaVencimento);
    const [existente] = await tx
      .select()
      .from(t.fatura)
      .where(and(eq(t.fatura.cartaoId, cartao.id), eq(t.fatura.cicloFim, ciclo.cicloFim)));
    if (existente) {
      if (existente.status !== "paga") return existente;
      ref = addDias(ciclo.cicloFim, 1);
      continue;
    }
    const [nova] = await tx
      .insert(t.fatura)
      .values({ empresaId: cartao.empresaId, cartaoId: cartao.id, ...ciclo })
      .returning();
    if (!nova) throw new Error("falha ao criar fatura");
    return nova;
  }
  throw new Error("nao foi possivel alocar fatura aberta para a compra");
}

/** Divide `valor` em N parcelas de 2 casas, centavos de ajuste na primeira (RN-05). */
export function dividirParcelas(valor: number, n: number): number[] {
  const centavosTotal = Math.round(valor * 100);
  const base = Math.floor(centavosTotal / n);
  const resto = centavosTotal - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base) / 100);
}
