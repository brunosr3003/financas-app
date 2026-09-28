/**
 * RN-17: vencimento em fim de semana ou feriado nacional adia para o proximo dia util.
 * Feriados moveis derivados da Pascoa (computus de Gauss/Meeus).
 */
import { addDias, fromISO, toISO } from "./fatura.js";

function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(new Date(Date.UTC(ano, mes - 1, dia)));
}

const cache = new Map<number, Set<string>>();

export function feriadosNacionais(ano: number): Set<string> {
  const memo = cache.get(ano);
  if (memo) return memo;
  const p = pascoa(ano);
  const fixos = [
    `${ano}-01-01`, // Confraternizacao
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Trabalho
    `${ano}-09-07`, // Independencia
    `${ano}-10-12`, // N. Sra. Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamacao da Republica
    `${ano}-11-20`, // Consciencia Negra
    `${ano}-12-25`, // Natal
  ];
  const moveis = [
    addDias(p, -48), // Carnaval (segunda)
    addDias(p, -47), // Carnaval (terca)
    addDias(p, -2), //  Sexta-feira Santa
    addDias(p, 60), //  Corpus Christi
  ];
  const set = new Set([...fixos, ...moveis]);
  cache.set(ano, set);
  return set;
}

export function ehDiaUtil(iso: string): boolean {
  const dow = fromISO(iso).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosNacionais(fromISO(iso).getUTCFullYear()).has(iso);
}

export function proximoDiaUtil(iso: string): string {
  let d = iso;
  while (!ehDiaUtil(d)) d = addDias(d, 1);
  return d;
}
