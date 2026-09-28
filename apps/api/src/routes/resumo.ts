import type { FastifyInstance } from "fastify";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";
import { linhasCaixaAte, saldoAte } from "../dominio/caixa.js";
import { addDias, cicloParaCompra, toISO } from "../dominio/fatura.js";
import { projecoesDoPeriodo } from "../dominio/projecoes.js";

function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fim: toISO(new Date(Date.UTC(ano!, m!, 0))) };
}

function mesesNoPeriodo(inicio: string, fim: string): number {
  const [ai, mi] = inicio.split("-").map(Number);
  const [af, mf] = fim.split("-").map(Number);
  return Math.max(1, (af! - ai!) * 12 + (mf! - mi!) + 1);
}

export async function resumoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  /** Tela Resumo (4.1). ?mes=YYYY-MM ou ?inicio&fim (RN-12). */
  app.get("/resumo", async (req) => {
    const q = req.query as { mes?: string; inicio?: string; fim?: string };
    const hoje = hojeISO();
    const { inicio, fim } =
      q.inicio && q.fim ? { inicio: q.inicio, fim: q.fim } : limitesDoMes(q.mes ?? hoje.slice(0, 7));
    const nMeses = mesesNoPeriodo(inicio.slice(0, 7), fim.slice(0, 7));

    return withEmpresa(req.user.empresaId, async (tx) => {
      const empresaId = req.user.empresaId;

      // --- Contas: saldo atual (posicao de hoje, independe do periodo — RN-12)
      const contas = await tx
        .select()
        .from(t.conta)
        .where(and(eq(t.conta.empresaId, empresaId), eq(t.conta.arquivada, false)));
      const caixa = await linhasCaixaAte(tx, empresaId, hoje);
      const contasComSaldo = contas.map((c) => ({
        id: c.id,
        nome: c.nome,
        banco: c.banco,
        cor: c.cor,
        saldo: saldoAte([c], caixa.filter((l) => l.contaId === c.id), hoje, [c.id]),
      }));
      const totalContas = contasComSaldo.reduce((s, c) => s + c.saldo, 0);

      // --- Cartoes: limite utilizado (RN-06), melhor dia (RN-07), proxima fatura
      const cartoes = await tx
        .select()
        .from(t.cartao)
        .where(and(eq(t.cartao.empresaId, empresaId), eq(t.cartao.arquivado, false)));
      const cartoesInfo = [];
      for (const card of cartoes) {
        const [linha] = (await tx.execute(sql`
          select
            coalesce(sum(tr.valor), 0) as utilizado,
            coalesce(sum(tr.valor) filter (where f.status != 'paga'), 0) as em_aberto
          from ${t.transacao} tr
          join ${t.fatura} f on f.id = tr.fatura_id
          where tr.cartao_id = ${card.id} and f.status != 'paga'
        `)) as unknown as [{ utilizado: string; em_aberto: string }];
        const [pagoParcial] = (await tx.execute(sql`
          select coalesce(sum(valor_pago), 0) as pago from ${t.fatura}
          where cartao_id = ${card.id} and status != 'paga'
        `)) as unknown as [{ pago: string }];
        const utilizado = Number(linha!.utilizado) - Number(pagoParcial!.pago);

        const faturas = await tx
          .select({
            id: t.fatura.id,
            vencimento: t.fatura.vencimento,
            cicloFim: t.fatura.cicloFim,
            status: t.fatura.status,
            valorPago: t.fatura.valorPago,
            total: sql<string>`coalesce((select sum(valor) from ${t.transacao} where fatura_id = ${t.fatura.id}), 0)`,
          })
          .from(t.fatura)
          .where(and(eq(t.fatura.cartaoId, card.id), sql`${t.fatura.status} != 'paga'`));
        // status efetivo por data: ciclo encerrado = fechada (RN-03)
        const fechadas = faturas.filter((f) => f.cicloFim < hoje);
        const abertas = faturas.filter((f) => f.cicloFim >= hoje);
        const proxima = (fechadas.length > 0 ? fechadas : abertas).sort((a, b) =>
          a.vencimento.localeCompare(b.vencimento),
        )[0];

        const ciclo = cicloParaCompra(hoje, card.diaFechamento, card.diaVencimento);
        const melhorDia = addDias(ciclo.cicloFim, 1);
        const pct = Number(card.limite) > 0 ? Math.round((utilizado / Number(card.limite)) * 1000) / 10 : 0;

        cartoesInfo.push({
          id: card.id,
          nome: card.nome,
          limite: Number(card.limite),
          utilizado: Math.round(utilizado * 100) / 100,
          disponivel: Math.round((Number(card.limite) - utilizado) * 100) / 100,
          pctUtilizado: pct,
          alerta: pct >= 90 ? "critico" : pct >= 70 ? "atencao" : null,
          melhorDiaCompra: melhorDia,
          proximaFatura: proxima
            ? { vencimento: proxima.vencimento, valor: Number(proxima.total) - Number(proxima.valorPago) }
            : null,
        });
      }

      // --- Baldes: previsto vs realizado por competencia (RN-01/02)
      const [cfg] = await tx.select().from(t.config).where(eq(t.config.empresaId, empresaId));
      const rendaBase = Number(cfg?.rendaBase ?? 0);
      const baldes = await tx.select().from(t.balde).where(eq(t.balde.empresaId, empresaId));
      const realizadoPorBalde = (await tx
        .select({ baldeId: t.transacao.baldeId, total: sql<string>`sum(${t.transacao.valor})` })
        .from(t.transacao)
        .where(
          and(
            eq(t.transacao.empresaId, empresaId),
            eq(t.transacao.tipo, "saida"),
            eq(t.transacao.pendente, false),
            gte(t.transacao.data, inicio),
            lte(t.transacao.data, fim),
            sql`${t.transacao.baldeId} is not null`,
            sql`${t.transacao.projetoId} is null`,
          ),
        )
        .groupBy(t.transacao.baldeId)) as Array<{ baldeId: string | null; total: string }>;
      const realizadoMap = new Map(realizadoPorBalde.map((r) => [r.baldeId, Number(r.total)]));
      const baldesInfo = baldes.map((b) => {
        const meta = Math.round(rendaBase * Number(b.pct) * nMeses) / 100;
        const realizado = realizadoMap.get(b.id) ?? 0;
        return {
          id: b.id,
          nome: b.nome,
          pct: Number(b.pct),
          cor: b.cor,
          descricao: b.descricao,
          meta,
          realizado,
          disponivel: Math.round((meta - realizado) * 100) / 100,
          estouro: realizado > meta,
        };
      });

      // --- Provisionamento do mes corrente (RN-11)
      const mesCorrente = limitesDoMes(hoje.slice(0, 7));
      const proj = await projecoesDoPeriodo(tx, empresaId, mesCorrente.inicio, mesCorrente.fim, hoje);
      const entradasPrevistas = proj.filter((p) => p.tipo === "entrada").reduce((s, p) => s + p.valor, 0);
      const saidasPrevistas = proj.filter((p) => p.tipo === "saida").reduce((s, p) => s + p.valor, 0);
      const [desligadas] = (await tx.execute(sql`
        select count(*)::int as n from ${t.provisao}
        where empresa_id = ${empresaId} and ativa = false
      `)) as unknown as [{ n: number }];
      const saldoHoje = saldoAte(contas, caixa, hoje, null);

      // --- Reservas & investimentos
      const reservas = await tx.select().from(t.reserva).where(eq(t.reserva.empresaId, empresaId));
      const aplicacoes = await tx.select().from(t.aplicacao).where(eq(t.aplicacao.empresaId, empresaId));
      const totalReservas = aplicacoes.reduce((s, a) => s + Number(a.valorAtual), 0);

      return {
        periodo: { inicio, fim, meses: nMeses },
        provisionamentoMes: {
          entradasPrevistas: Math.round(entradasPrevistas * 100) / 100,
          saidasPrevistas: Math.round(saidasPrevistas * 100) / 100,
          saldoProjetadoFimMes: Math.round((saldoHoje + entradasPrevistas - saidasPrevistas) * 100) / 100,
          projecoesDesligadas: desligadas!.n,
        },
        contas: contasComSaldo,
        totalContas: Math.round(totalContas * 100) / 100,
        cartoes: cartoesInfo,
        reservas: { total: totalReservas, objetivos: reservas.length, itens: aplicacoes.length },
        baldes: baldesInfo,
        rendaBase,
      };
    });
  });
}
