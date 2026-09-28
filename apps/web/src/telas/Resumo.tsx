import { useEffect, useState } from "react";
import { api, brl, hojeISO, addMesStr, nomeMes } from "../api";

interface ResumoDados {
  periodo: { inicio: string; fim: string; meses: number };
  provisionamentoMes: { entradasPrevistas: number; saidasPrevistas: number; saldoProjetadoFimMes: number; projecoesDesligadas: number };
  contas: Array<{ id: string; nome: string; banco: string; cor: string; saldo: number }>;
  totalContas: number;
  cartoes: Array<{
    id: string; nome: string; limite: number; utilizado: number; disponivel: number; pctUtilizado: number;
    alerta: string | null; melhorDiaCompra: string; proximaFatura: { vencimento: string; valor: number } | null;
  }>;
  baldes: Array<{ id: string; nome: string; pct: number; cor: string; descricao: string | null; meta: number; realizado: number; disponivel: number; estouro: boolean }>;
  rendaBase: number;
}

interface Reserva {
  id: string; nome: string; meta: string; total: number; progresso: number | null;
  aplicacoes: Array<{ id: string; instituicao: string; produto: string; valorAtual: string }>;
}

export function Resumo({ recarga }: { recarga: number }) {
  const mesAtual = hojeISO().slice(0, 7);
  const [periodo, setPeriodo] = useState<{ tipo: string; mes?: string; inicio?: string; fim?: string }>({ tipo: "mes", mes: mesAtual });
  const [dados, setDados] = useState<ResumoDados | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [perModal, setPerModal] = useState(false);
  const [perIni, setPerIni] = useState(`${mesAtual}-01`);
  const [perFim, setPerFim] = useState(hojeISO());

  useEffect(() => {
    const q =
      periodo.tipo === "mes"
        ? `?mes=${periodo.mes}`
        : `?inicio=${periodo.inicio}&fim=${periodo.fim}`;
    api<ResumoDados>("GET", `/resumo${q}`).then(setDados);
    api<Reserva[]>("GET", "/reservas").then(setReservas);
  }, [periodo, recarga]);

  if (!dados) return <div className="spin">Carregando…</div>;

  const chips: Array<{ rotulo: string; ativo: boolean; acao: () => void }> = [
    { rotulo: nomeMes(mesAtual), ativo: periodo.tipo === "mes" && periodo.mes === mesAtual, acao: () => setPeriodo({ tipo: "mes", mes: mesAtual }) },
    { rotulo: nomeMes(addMesStr(mesAtual, -1)), ativo: periodo.tipo === "mes" && periodo.mes === addMesStr(mesAtual, -1), acao: () => setPeriodo({ tipo: "mes", mes: addMesStr(mesAtual, -1) }) },
    {
      rotulo: "Últimos 3 meses", ativo: periodo.tipo === "3m",
      acao: () => setPeriodo({ tipo: "3m", inicio: `${addMesStr(mesAtual, -2)}-01`, fim: hojeISO() }),
    },
    { rotulo: "Período…", ativo: periodo.tipo === "custom", acao: () => setPerModal(true) },
  ];
  const p = dados.provisionamentoMes;
  const totalReservas = reservas.reduce((s, r) => s + r.total, 0);

  return (
    <section>
      <div className="chips">
        {chips.map((c) => (
          <button key={c.rotulo} className={`chip${c.ativo ? " active" : ""}`} onClick={c.acao}>{c.rotulo}</button>
        ))}
      </div>

      <h2 className="section">Provisionamento do mês</h2>
      <div className="card">
        <div className="prov-grid">
          <div className="cell"><div className="k">Entradas previstas</div><div className="v pos">{brl(p.entradasPrevistas)}</div></div>
          <div className="cell"><div className="k">Saídas previstas</div><div className="v neg">{brl(p.saidasPrevistas)}</div></div>
          <div className="cell"><div className="k">Saldo fim do mês</div><div className={`v ${p.saldoProjetadoFimMes >= 0 ? "pos" : "neg"}`}>{brl(p.saldoProjetadoFimMes)}</div></div>
        </div>
        {p.projecoesDesligadas > 0 && (
          <div style={{ fontSize: "11.5px", color: "var(--ink-muted)", textAlign: "center", marginTop: 8 }}>
            {p.projecoesDesligadas} projeção(ões) desligada(s) — os números acima refletem apenas as ativas
          </div>
        )}
      </div>

      <h2 className="section">Contas</h2>
      <div className="card">
        {dados.contas.map((c) => (
          <div key={c.id} className="acct-row">
            <div className="n"><span className="dot" style={{ background: c.cor }} />{c.nome}</div>
            <div className={`v${c.saldo < 0 ? " neg" : ""}`}>{brl(c.saldo)}</div>
          </div>
        ))}
        <div className="acct-row total"><div className="n">Total em contas</div><div className="v">{brl(dados.totalContas)}</div></div>
      </div>

      <h2 className="section">Cartões de crédito</h2>
      <div className="card">
        {dados.cartoes.length === 0 && <div className="empty">Nenhum cartão cadastrado.</div>}
        {dados.cartoes.map((k) => (
          <div key={k.id} className="cardline">
            <div className="top"><span className="n">{k.nome}</span><span className="u">{brl(k.utilizado)} de {brl(k.limite)}</span></div>
            <div className="limitbar">
              <div className={k.alerta === "critico" ? "crit" : k.alerta === "atencao" ? "hi" : ""} style={{ width: `${Math.min(k.pctUtilizado, 100)}%` }} />
            </div>
            <div className="foot">
              <span>{k.pctUtilizado.toFixed(0)}% usado · disponível {brl(k.disponivel)}</span>
              {k.proximaFatura && <span>próx. fatura {brl(k.proximaFatura.valor)} · vence {k.proximaFatura.vencimento.slice(8, 10)}/{k.proximaFatura.vencimento.slice(5, 7)}</span>}
            </div>
          </div>
        ))}
      </div>

      <h2 className="section">Reservas &amp; investimentos</h2>
      <div className="card">
        {reservas.length === 0 && <div className="empty">Nenhuma reserva. Crie em Cadastros (☰) → Reservas.</div>}
        {reservas.map((r) => (
          <div key={r.id}>
            <div className="acct-row">
              <div className="n"><strong>{r.nome}</strong>{r.progresso != null && <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{r.progresso.toFixed(0)}% da meta</span>}</div>
              <div className="v">{brl(r.total)}</div>
            </div>
            {r.aplicacoes.map((a) => (
              <div key={a.id} className="acct-row" style={{ paddingLeft: 14, fontSize: 13 }}>
                <div className="n" style={{ color: "var(--ink-2)" }}>{a.instituicao} · {a.produto}</div>
                <div className="v" style={{ fontWeight: 500 }}>{brl(a.valorAtual)}</div>
              </div>
            ))}
          </div>
        ))}
        {reservas.length > 0 && (
          <div className="acct-row total"><div className="n">Total reservado</div><div className="v">{brl(totalReservas)}</div></div>
        )}
      </div>

      <h2 className="section">Baldes — Previsto vs Realizado</h2>
      <div>
        {dados.baldes.map((b) => {
          const pct = b.meta > 0 ? Math.min((b.realizado / b.meta) * 100, 100) : 0;
          return (
            <div key={b.id} className="meter-card">
              <div className="meter-head">
                <div className="name">
                  <span className="dot" style={{ background: b.cor }} />
                  {b.nome} <span className="pct">{b.pct.toFixed(0)}%</span>
                  {b.descricao && <span className="info-dot" title={b.descricao}>ⓘ<span className="tip">{b.descricao}</span></span>}
                </div>
                <div className="nums">{brl(b.realizado)} / {brl(b.meta)}</div>
              </div>
              <div className="meter-track"><div className={`meter-fill${b.estouro ? " over" : ""}`} style={{ width: `${pct}%`, background: b.estouro ? undefined : b.cor }} /></div>
              <div className="meter-foot">
                <span>{b.meta > 0 ? `${((b.realizado / b.meta) * 100).toFixed(0)}% da meta` : "sem meta"}</span>
                {b.estouro ? <span className="over-flag">estourou {brl(b.realizado - b.meta)}</span> : <span className="under-flag">livre {brl(b.disponivel)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {perModal && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setPerModal(false)}>
          <div className="modal">
            <h3>Período personalizado</h3>
            <div className="row2">
              <div className="field"><label>Início</label><input type="date" value={perIni} onChange={(e) => setPerIni(e.target.value)} /></div>
              <div className="field"><label>Fim</label><input type="date" value={perFim} onChange={(e) => setPerFim(e.target.value)} /></div>
            </div>
            <div className="note">As metas dos baldes são multiplicadas pelo nº de meses do período.</div>
            <button className="btn" onClick={() => { setPeriodo({ tipo: "custom", inicio: perIni, fim: perFim }); setPerModal(false); }}>Aplicar período</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setPerModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
