/**
 * RN-20: cronograma de operacoes de credito calculado pelo sistema.
 * SAC: amortizacao constante (principal / n), juros sobre saldo devedor.
 * PRICE: prestacao fixa PMT = P * i / (1 - (1+i)^-n).
 */
import * as t from "../db/schema.js";
import { addMeses } from "./fatura.js";

type Credito = typeof t.credito.$inferSelect;

export interface ParcelaCredito {
  numero: number;
  vencimento: string;
  amortizacao: number;
  juros: number;
  valor: number;
  saldoDevedor: number;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function mesesEntre(inicioISO: string, fimISO: string): number {
  const [ai, mi] = inicioISO.split("-").map(Number);
  const [af, mf] = fimISO.split("-").map(Number);
  return (af! - ai!) * 12 + (mf! - mi!) + 1;
}

export function cronograma(c: Credito): ParcelaCredito[] {
  const n = mesesEntre(c.inicio, c.fim);
  const principal = Number(c.principal);
  const i = Number(c.taxaMes) / 100;
  const primeiroVenc = (() => {
    const [ano, mes] = c.inicio.split("-").map(Number);
    const dia = String(c.diaVencimento).padStart(2, "0");
    return `${ano}-${String(mes).padStart(2, "0")}-${dia}`;
  })();

  const parcelas: ParcelaCredito[] = [];
  let saldo = principal;
  if (c.sistema === "sac") {
    const amort = principal / n;
    for (let k = 1; k <= n; k += 1) {
      const juros = saldo * i;
      saldo -= amort;
      parcelas.push({
        numero: k,
        vencimento: addMeses(primeiroVenc, k - 1),
        amortizacao: r2(amort),
        juros: r2(juros),
        valor: r2(amort + juros),
        saldoDevedor: r2(Math.max(saldo, 0)),
      });
    }
  } else {
    const pmt = i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));
    for (let k = 1; k <= n; k += 1) {
      const juros = saldo * i;
      const amort = pmt - juros;
      saldo -= amort;
      parcelas.push({
        numero: k,
        vencimento: addMeses(primeiroVenc, k - 1),
        amortizacao: r2(amort),
        juros: r2(juros),
        valor: r2(pmt),
        saldoDevedor: r2(Math.max(saldo, 0)),
      });
    }
  }
  return parcelas;
}

/** Posicao na data de referencia: parcelas pagas/restantes e a parcela corrente. */
export function posicao(c: Credito, hojeISO: string) {
  const todas = cronograma(c);
  const pagas = todas.filter((p) => p.vencimento < hojeISO).length;
  const corrente = todas[pagas] ?? null;
  return {
    totalParcelas: todas.length,
    pagas,
    restantes: todas.length - pagas,
    parcelaCorrente: corrente,
    saldoDevedor: corrente ? todas[pagas === 0 ? 0 : pagas - 1]?.saldoDevedor ?? Number(c.principal) : 0,
  };
}
