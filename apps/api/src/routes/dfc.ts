import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";
import { linhasCaixaAte, saldoAte } from "../dominio/caixa.js";
import { addDias, toISO } from "../dominio/fatura.js";
import { filtrarPorContas, projecoesDoPeriodo } from "../dominio/projecoes.js";

function hojeISO(): string {
  // Fuso America/Sao_Paulo (spec 1.2)
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split("-").map(Number);
  const fim = toISO(new Date(Date.UTC(ano!, m!, 0)));
  return { inicio: `${mes}-01`, fim };
}

export async function dfcRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  /**
   * RN-10 — Extrato & Projecoes.
   * ?mes=YYYY-MM (padrao: corrente) OU ?inicio&fim livres; ?contas=id,id (multisselecao);
   * ?projecoes=false desliga o switch mestre.
   */
  app.get("/dfc", async (req) => {
    const q = req.query as { mes?: string; inicio?: string; fim?: string; contas?: string; projecoes?: string };
    const hoje = hojeISO();
    const { inicio, fim } =
      q.inicio && q.fim ? { inicio: q.inicio, fim: q.fim } : limitesDoMes(q.mes ?? hoje.slice(0, 7));
    const selecao = q.contas ? q.contas.split(",").filter(Boolean) : null;
    const incluirProjecoes = q.projecoes !== "false";

    return withEmpresa(req.user.empresaId, async (tx) => {
      const contas = await tx.select().from(t.conta).where(eq(t.conta.empresaId, req.user.empresaId));
      const caixa = await linhasCaixaAte(tx, req.user.empresaId, fim);
      const idsSelecao = selecao && selecao.length > 0 ? new Set(selecao) : null;

      // Saldo inicial do periodo = encadeamento do extrato ate o dia anterior
      const vespera = addDias(inicio, -1);
      const saldoInicial = saldoAte(contas, caixa, vespera, selecao);

      const linhas: Array<{
        data: string;
        historico: string;
        credito: number | null;
        debito: number | null;
        saldo: number;
        projetado: boolean;
        origem: string;
      }> = [];
      let saldo = saldoInicial;

      // Saldos de implantacao que caem dentro do periodo entram como linha
      for (const c of contas) {
        if (c.dataSaldoInicial >= inicio && c.dataSaldoInicial <= fim && (!idsSelecao || idsSelecao.has(c.id))) {
          saldo += Number(c.saldoInicial);
          linhas.push({
            data: c.dataSaldoInicial,
            historico: `Saldo de implantacao — ${c.nome}`,
            credito: Number(c.saldoInicial),
            debito: null,
            saldo,
            projetado: false,
            origem: "implantacao",
          });
        }
      }

      for (const l of caixa) {
        if (l.data < inicio || l.data > fim) continue;
        if (idsSelecao && !idsSelecao.has(l.contaId)) continue;
        saldo += l.tipo === "entrada" ? l.valor : -l.valor;
        linhas.push({
          data: l.data,
          historico: l.historico,
          credito: l.tipo === "entrada" ? l.valor : null,
          debito: l.tipo === "saida" ? l.valor : null,
          saldo: Math.round(saldo * 100) / 100,
          projetado: false,
          origem: "realizado",
        });
      }
      const saldoFinalAtual = saldo;

      let projecoesDesligadas = 0;
      if (incluirProjecoes && fim > hoje) {
        const proj = filtrarPorContas(
          await projecoesDoPeriodo(tx, req.user.empresaId, inicio, fim, hoje),
          selecao,
        );
        for (const p of proj) {
          saldo += p.tipo === "entrada" ? p.valor : -p.valor;
          linhas.push({
            data: p.data,
            historico: p.historico,
            credito: p.tipo === "entrada" ? p.valor : null,
            debito: p.tipo === "saida" ? p.valor : null,
            saldo: Math.round(saldo * 100) / 100,
            projetado: true,
            origem: p.origem,
          });
        }
      } else if (!incluirProjecoes) {
        projecoesDesligadas = -1; // switch mestre off
      }

      linhas.sort((a, b) => a.data.localeCompare(b.data) || Number(a.projetado) - Number(b.projetado));
      // Recalcula o acumulado apos a ordenacao estavel
      let acum = saldoInicial;
      for (const l of linhas) {
        acum += (l.credito ?? 0) - (l.debito ?? 0);
        l.saldo = Math.round(acum * 100) / 100;
      }

      return {
        inicio,
        fim,
        hoje,
        saldoInicial,
        linhas,
        saldoFinalAtual,
        saldoFinalProjetado: Math.round(acum * 100) / 100,
        projecoesLigadas: incluirProjecoes,
        projecoesDesligadas,
      };
    });
  });
}
