/**
 * Motor de projecoes (RN-08/09/10/16/17): tudo que ainda vai acontecer com o
 * caixa — provisoes recorrentes, faturas em aberto, pagamentos de projeto
 * agendados e parcelas de credito — como linhas datadas para o DFC e o Resumo.
 */
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import * as t from "../db/schema.js";
import type { Tx } from "../db/with-empresa.js";
import { cronograma, posicao } from "./credito.js";
import { proximoDiaUtil } from "./dias-uteis.js";
import { dec } from "../seguranca/crypto.js";

export interface LinhaProjecao {
  data: string;
  historico: string;
  tipo: "entrada" | "saida";
  valor: number;
  origem: "provisao" | "fatura" | "projeto" | "credito";
  refId: string;
  contaId: string | null;
  projetoId?: string | null;
}

function mesesDoIntervalo(inicio: string, fim: string): Array<{ ano: number; mes: number }> {
  const [ai, mi] = inicio.split("-").map(Number);
  const [af, mf] = fim.split("-").map(Number);
  const out: Array<{ ano: number; mes: number }> = [];
  let ano = ai!;
  let mes = mi!;
  while (ano < af! || (ano === af! && mes <= mf!)) {
    out.push({ ano, mes });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return out;
}

function dataNoMes(ano: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Provisao nao mensal ocorre no mes M quando alinhada ao mes de vencimento. */
function ocorreNoMes(rec: string, mesVencimento: number | null, mes: number): boolean {
  if (rec === "mensal") return true;
  if (mesVencimento == null) return false;
  const passo = rec === "trimestral" ? 3 : rec === "semestral" ? 6 : 12;
  if (rec === "unica") return mes === mesVencimento;
  return ((mes - mesVencimento) % passo + passo) % passo === 0;
}

export async function projecoesDoPeriodo(
  tx: Tx,
  empresaId: string,
  inicio: string,
  fim: string,
  hoje: string,
): Promise<LinhaProjecao[]> {
  const linhas: LinhaProjecao[] = [];
  const meses = mesesDoIntervalo(inicio.slice(0, 7), fim.slice(0, 7));

  // 1. Provisoes manuais ativas (mensais e nao mensais) — RN-08/16
  const provisoes = await tx
    .select()
    .from(t.provisao)
    .where(and(eq(t.provisao.empresaId, empresaId), eq(t.provisao.ativa, true), eq(t.provisao.automatica, false)));
  for (const p of provisoes) {
    if (p.valor == null || p.dia == null) continue;
    for (const { ano, mes } of meses) {
      if (!ocorreNoMes(p.recorrencia, p.mesVencimento, mes)) continue;
      const data = proximoDiaUtil(dataNoMes(ano, mes, p.dia));
      if (data < inicio || data > fim || data <= hoje) continue;
      linhas.push({
        data,
        historico: p.nome,
        tipo: p.tipo,
        valor: Number(p.valor),
        origem: "provisao",
        refId: p.id,
        contaId: p.contaId,
        projetoId: p.projetoId,
      });
    }
  }

  // 2. Faturas nao pagas na data de vencimento (RN-03/04) — sem conta vinculada.
  //    Toggle: provisao automatica com fatura_id e ativa=false desliga a projecao.
  const faturas = await tx
    .select({
      id: t.fatura.id,
      vencimento: t.fatura.vencimento,
      valorPago: t.fatura.valorPago,
      cartaoNome: t.cartao.nome,
      total: sql<string>`coalesce((select sum(valor) from ${t.transacao} where fatura_id = ${t.fatura.id}), 0)`,
    })
    .from(t.fatura)
    .innerJoin(t.cartao, eq(t.cartao.id, t.fatura.cartaoId))
    .where(and(eq(t.fatura.empresaId, empresaId), ne(t.fatura.status, "paga")));
  const desligadas = await tx
    .select({ faturaId: t.provisao.faturaId })
    .from(t.provisao)
    .where(and(eq(t.provisao.empresaId, empresaId), eq(t.provisao.automatica, true), eq(t.provisao.ativa, false)));
  const faturasOff = new Set(desligadas.map((d) => d.faturaId));
  for (const f of faturas) {
    const restante = Number(f.total) - Number(f.valorPago);
    if (restante <= 0 || faturasOff.has(f.id)) continue;
    const data = proximoDiaUtil(f.vencimento);
    if (data < inicio || data > fim || data <= hoje) continue;
    linhas.push({
      data,
      historico: `Fatura ${f.cartaoNome}`,
      tipo: "saida",
      valor: restante,
      origem: "fatura",
      refId: f.id,
      contaId: null, // modelo boleto: so na visao consolidada ate ser paga
    });
  }

  // 3. Pagamentos de projeto agendados e ativos, com master switch (RN-13/09)
  const pagamentos = await tx
    .select({
      id: t.pagamentoProjeto.id,
      descricao: t.pagamentoProjeto.descricao,
      valor: t.pagamentoProjeto.valor,
      dataPrevista: t.pagamentoProjeto.dataPrevista,
      contaId: t.pagamentoProjeto.contaId,
      projetoId: t.pagamentoProjeto.projetoId,
      projetoNome: t.projeto.nome,
    })
    .from(t.pagamentoProjeto)
    .innerJoin(t.projeto, eq(t.projeto.id, t.pagamentoProjeto.projetoId))
    .where(
      and(
        eq(t.pagamentoProjeto.empresaId, empresaId),
        eq(t.pagamentoProjeto.status, "agendado"),
        eq(t.pagamentoProjeto.ativa, true),
        eq(t.projeto.ativo, true),
        gte(t.pagamentoProjeto.dataPrevista, inicio),
        lte(t.pagamentoProjeto.dataPrevista, fim),
      ),
    );
  for (const pg of pagamentos) {
    const data = proximoDiaUtil(pg.dataPrevista);
    if (data <= hoje || data > fim) continue;
    linhas.push({
      data,
      historico: `${pg.projetoNome}: ${dec(pg.descricao)}`,
      tipo: "saida",
      valor: Number(pg.valor),
      origem: "projeto",
      refId: pg.id,
      contaId: pg.contaId,
      projetoId: pg.projetoId,
    });
  }

  // 4. Parcelas de credito no periodo (RN-20)
  const creditos = await tx
    .select()
    .from(t.credito)
    .where(and(eq(t.credito.empresaId, empresaId), eq(t.credito.ativa, true)));
  for (const c of creditos) {
    const { parcelaCorrente, restantes } = posicao(c, hoje);
    if (!parcelaCorrente || restantes === 0) continue;
    for (const parc of cronograma(c)) {
      const data = proximoDiaUtil(parc.vencimento);
      if (data < inicio || data > fim || data <= hoje) continue;
      linhas.push({
        data,
        historico: `${c.nome} (${parc.numero}ª parcela)`,
        tipo: "saida",
        valor: parc.valor,
        origem: "credito",
        refId: c.id,
        contaId: c.contaId,
      });
    }
  }

  linhas.sort((a, b) => a.data.localeCompare(b.data));
  return linhas;
}

/** Filtra projecoes pela selecao de contas: sem filtro = consolidado (tudo). */
export function filtrarPorContas(linhas: LinhaProjecao[], contas: string[] | null): LinhaProjecao[] {
  if (!contas || contas.length === 0) return linhas;
  // Fatura sem conta so aparece na visao consolidada (RN-04)
  return linhas.filter((l) => l.contaId != null && contas.includes(l.contaId));
}
