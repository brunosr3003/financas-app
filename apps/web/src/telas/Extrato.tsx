import { Fragment, useCallback, useEffect, useState } from "react";
import { api, addMesStr, brl, ddmm, hojeISO, nomeMes } from "../api";

interface LinhaDfc { data: string; historico: string; credito: number | null; debito: number | null; saldo: number; projetado: boolean; origem: string }
interface Dfc { inicio: string; fim: string; hoje: string; saldoInicial: number; linhas: LinhaDfc[]; saldoFinalAtual: number; saldoFinalProjetado: number; projecoesLigadas: boolean }
interface Painel {
  servicosMensais: Array<{ id: string; nome: string; valor: string | null; ativa: boolean; tipo: string }>;
  naoMensais: Array<{ id: string; nome: string; valor: string | null; ativa: boolean; reservaMensal: number }>;
  creditos: Array<{ id: string; nome: string; ativa: boolean; posicao: { parcelaCorrente: { valor: number } | null; restantes: number } }>;
  faturasDesligadas: string[];
}
interface Fatura { id: string; cartaoId: string; vencimento: string; status: string }
interface Projeto { id: string; nome: string; ativo: boolean; comprometido: number }

export function Extrato({ recarga, aoMudar }: { recarga: number; aoMudar: () => void }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [range, setRange] = useState<{ inicio: string; fim: string } | null>(null);
  const [contas, setContas] = useState<Array<{ id: string; nome: string; cor: string }>>([]);
  const [selecao, setSelecao] = useState<string[]>([]);
  const [projecoes, setProjecoes] = useState(true);
  const [dfc, setDfc] = useState<Dfc | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [perModal, setPerModal] = useState(false);
  const [perIni, setPerIni] = useState(`${hoje.slice(0, 7)}-01`);
  const [perFim, setPerFim] = useState(hoje);

  const carregar = useCallback(() => {
    const base = range ? `inicio=${range.inicio}&fim=${range.fim}` : `mes=${mes}`;
    const c = selecao.length > 0 ? `&contas=${selecao.join(",")}` : "";
    api<Dfc>("GET", `/dfc?${base}${c}&projecoes=${projecoes}`).then(setDfc);
  }, [mes, range, selecao, projecoes]);

  useEffect(() => {
    api<Array<{ id: string; nome: string; cor: string }>>("GET", "/contas").then(setContas);
  }, [recarga]);
  useEffect(carregar, [carregar, recarga]);
  useEffect(() => {
    if (!painelAberto) return;
    api<Painel>("GET", "/provisoes/painel").then(setPainel);
    api<Fatura[]>("GET", "/faturas").then((fs) => setFaturas(fs.filter((f) => f.status !== "paga")));
    api<Projeto[]>("GET", "/projetos").then(setProjetos);
  }, [painelAberto, recarga]);

  function toggleConta(id: string) {
    setSelecao((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function mudar(rota: string, corpo: unknown) {
    await api("PATCH", rota, corpo).catch(() => api("POST", rota, corpo));
    aoMudar();
  }

  const mesCorrente = !range && mes === hoje.slice(0, 7);
  const futuro = !range && mes > hoje.slice(0, 7);

  return (
    <section>
      <div className="dfc-controls">
        <div className="month-nav">
          <button onClick={() => { setRange(null); setMes(addMesStr(mes, -1)); }}>‹</button>
          <div className="month-label">{range ? `${ddmm(range.inicio)} – ${ddmm(range.fim)}` : nomeMes(mes)}</div>
          <button onClick={() => { setRange(null); setMes(addMesStr(mes, 1)); }}>›</button>
        </div>
        <button className="chip" onClick={() => setPerModal(true)}>Período…</button>
      </div>

      <div className="chips" style={{ padding: "0 0 8px" }}>
        <button className={`chip${selecao.length === 0 ? " active" : ""}`} onClick={() => setSelecao([])}>Todas</button>
        {contas.map((c) => (
          <button key={c.id} className={`chip${selecao.includes(c.id) ? " active" : ""}`} onClick={() => toggleConta(c.id)}>{c.nome}</button>
        ))}
      </div>

      {(mesCorrente || futuro || range) && (
        <div className="dfc-controls">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <label className="switch"><input type="checkbox" checked={projecoes} onChange={(e) => setProjecoes(e.target.checked)} /><span className="sl" /></label>
            Projeções
          </div>
          <button className="chip" onClick={() => setPainelAberto(!painelAberto)}>Escolher projeções {painelAberto ? "▴" : "▾"}</button>
        </div>
      )}

      {painelAberto && painel && (
        <div className="card" style={{ marginBottom: 10, padding: "10px 12px" }}>
          <div className="dfc-p-group">Recorrentes</div>
          {[...painel.servicosMensais, ...painel.naoMensais].map((p) => (
            <div key={p.id} className={`dfc-p-row${p.ativa ? "" : " off"}`}>
              <span>{p.nome}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="v">{brl(p.valor)}</span>
                <label className="switch sm"><input type="checkbox" checked={p.ativa} onChange={() => mudar(`/provisoes/${p.id}`, { ativa: !p.ativa })} /><span className="sl" /></label>
              </span>
            </div>
          ))}
          <div className="dfc-p-group">Crédito</div>
          {painel.creditos.filter((c) => c.posicao.restantes > 0).map((c) => (
            <div key={c.id} className={`dfc-p-row${c.ativa ? "" : " off"}`}>
              <span>{c.nome}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="v">{brl(c.posicao.parcelaCorrente?.valor ?? 0)}</span>
                <label className="switch sm"><input type="checkbox" checked={c.ativa} onChange={() => mudar(`/creditos/${c.id}`, { ativa: !c.ativa })} /><span className="sl" /></label>
              </span>
            </div>
          ))}
          <div className="dfc-p-group">Faturas de cartão</div>
          {faturas.map((f) => {
            const ligada = !painel.faturasDesligadas.includes(f.id);
            return (
              <div key={f.id} className={`dfc-p-row${ligada ? "" : " off"}`}>
                <span>Fatura · vence {ddmm(f.vencimento)}</span>
                <label className="switch sm"><input type="checkbox" checked={ligada} onChange={async () => { await api("POST", `/faturas/${f.id}/projecao`, { ativa: !ligada }); aoMudar(); }} /><span className="sl" /></label>
              </div>
            );
          })}
          <div className="dfc-p-group">Projetos (master)</div>
          {projetos.map((p) => (
            <div key={p.id} className={`dfc-p-row${p.ativo ? "" : " off"}`}>
              <span>{p.nome}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="v">{brl(p.comprometido)}</span>
                <label className="switch sm"><input type="checkbox" checked={p.ativo} onChange={() => mudar(`/projetos/${p.id}`, { ativo: !p.ativo })} /><span className="sl" /></label>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: "right", fontSize: "10.5px", color: "var(--ink-muted)", marginBottom: 3 }}>valores em R$</div>
      <div className="card" style={{ padding: "4px 10px" }}>
        <table className="dfc">
          <thead><tr><th>Data</th><th>Histórico</th><th>Crédito</th><th>Débito</th><th>Saldo</th></tr></thead>
          <tbody>
            {dfc && (
              <>
                <tr><td className="data">{ddmm(dfc.inicio)}</td><td className="desc"><strong>Saldo inicial</strong></td><td /><td /><td className={`saldo${dfc.saldoInicial < 0 ? " neg" : ""}`}>{dfc.saldoInicial.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>
                {(() => {
                  const primeiraProj = dfc.linhas.findIndex((l) => l.projetado);
                  return dfc.linhas.map((l, i) => (
                    <Fragment key={i}>
                      {i === primeiraProj && <tr className="divider"><td colSpan={5}>▾ projeções</td></tr>}
                      <tr className={l.projetado ? "future" : ""}>
                        <td className="data">{ddmm(l.data)}</td>
                        <td className="desc" title={l.historico}>{l.historico}</td>
                        <td className={l.credito != null ? "cred" : ""}>{l.credito != null ? l.credito.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                        <td className={l.debito != null ? "deb" : ""}>{l.debito != null ? l.debito.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                        <td className={`saldo${l.saldo < 0 ? " neg" : ""}`}>{l.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </Fragment>
                  ));
                })()}
                <tr className="totalrow">
                  <td className="data" />
                  <td className="desc">Saldo final {projecoes && (mesCorrente || futuro) ? "(projetado)" : ""}</td>
                  <td /><td />
                  <td className={`saldo${dfc.saldoFinalProjetado < 0 ? " neg" : ""}`}>{dfc.saldoFinalProjetado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        {dfc && dfc.linhas.length === 0 && <div className="empty">Sem movimentos no período.</div>}
      </div>

      {perModal && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setPerModal(false)}>
          <div className="modal">
            <h3>Período do extrato</h3>
            <div className="row2">
              <div className="field"><label>Início</label><input type="date" value={perIni} onChange={(e) => setPerIni(e.target.value)} /></div>
              <div className="field"><label>Fim</label><input type="date" value={perFim} onChange={(e) => setPerFim(e.target.value)} /></div>
            </div>
            <div className="note">O extrato pode cruzar meses. Datas futuras entram como projeções, respeitando os toggles.</div>
            <button className="btn" onClick={() => { setRange({ inicio: perIni, fim: perFim }); setPerModal(false); }}>Aplicar período</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => { setRange(null); setPerModal(false); }}>Voltar à visão por mês</button>
          </div>
        </div>
      )}
    </section>
  );
}
