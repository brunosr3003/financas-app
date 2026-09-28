import { useEffect, useState } from "react";
import { api, brl, ddmm, hojeISO } from "../api";

interface Projeto { id: string; nome: string; budgetTotal: string; ativo: boolean; realizado: number; comprometido: number; livre: number }
interface Detalhe extends Projeto {
  etapas: Array<{ id: string; nome: string; budget: string; realizado: number; comprometido: number; livre: number }>;
  somaEtapas: number;
  etapasDivergem: boolean;
  pagamentos: Array<{ id: string; descricao: string; valor: string; dataPrevista: string; etapaId: string | null; contaId: string; status: string; dataPagamento: string | null; ativa: boolean }>;
}

export function Projetos({ recarga, aoMudar }: { recarga: number; aoMudar: () => void }) {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [contas, setContas] = useState<Array<{ id: string; nome: string }>>([]);
  const [novoModal, setNovoModal] = useState(false);
  const [etapaModal, setEtapaModal] = useState(false);
  const [pagtoModal, setPagtoModal] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Projeto[]>("GET", "/projetos").then(setProjetos);
    api<Array<{ id: string; nome: string }>>("GET", "/contas").then(setContas);
  }, [recarga]);

  useEffect(() => {
    if (aberto) api<Detalhe>("GET", `/projetos/${aberto}`).then(setDetalhe);
    else setDetalhe(null);
  }, [aberto, recarga]);

  async function toggleProjeto(p: Projeto) {
    await api("PATCH", `/projetos/${p.id}`, { ativo: !p.ativo });
    aoMudar();
  }

  function barra(realizado: number, comprometido: number, budget: number) {
    const pr = budget > 0 ? Math.min((realizado / budget) * 100, 100) : 0;
    const pc = budget > 0 ? Math.min((comprometido / budget) * 100, 100 - pr) : 0;
    return (
      <div className="limitbar" style={{ display: "flex" }}>
        <div style={{ width: `${pr}%`, borderRadius: "4px 0 0 4px" }} />
        <div style={{ width: `${pc}%`, background: "var(--warning)", borderRadius: 0, height: "100%" }} />
      </div>
    );
  }

  if (detalhe) {
    const agendados = detalhe.pagamentos.filter((p) => p.status === "agendado");
    const pagos = detalhe.pagamentos.filter((p) => p.status === "pago");
    const nomeEtapa = (id: string | null) => detalhe.etapas.find((e) => e.id === id)?.nome ?? "—";
    const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "—";
    return (
      <section>
        <button className="linkback" onClick={() => setAberto(null)}>‹ Projetos</button>
        <div className="proj-card">
          <div className="proj-head">
            <div className="n">{detalhe.nome}</div>
            <label className="switch"><input type="checkbox" checked={detalhe.ativo} onChange={() => toggleProjeto(detalhe)} /><span className="sl" /></label>
          </div>
          {barra(detalhe.realizado, detalhe.comprometido, Number(detalhe.budgetTotal))}
          <div className="proj-nums">
            <span>realizado {brl(detalhe.realizado)}</span>
            <span>comprometido {brl(detalhe.comprometido)}</span>
            <span>livre {brl(detalhe.livre)}</span>
          </div>
          <div className="proj-nums"><span>budget {brl(detalhe.budgetTotal)}</span></div>
        </div>

        <h2 className="section">Etapas <button className="more" onClick={() => { setForm({}); setEtapaModal(true); }}>+ criar etapa</button></h2>
        {detalhe.etapasDivergem && (
          <div className="note">A soma das etapas ({brl(detalhe.somaEtapas)}) diverge do budget do projeto ({brl(detalhe.budgetTotal)}).</div>
        )}
        {detalhe.etapas.map((e) => (
          <div key={e.id} className="meter-card">
            <div className="meter-head">
              <div className="name">{e.nome}</div>
              <div className="nums">{brl(e.realizado)} / {brl(e.budget)}</div>
            </div>
            {barra(e.realizado, e.comprometido, Number(e.budget))}
            <div className="meter-foot">
              <span>comprometido {brl(e.comprometido)}</span>
              {e.livre < 0 ? <span className="over-flag">estouro {brl(-e.livre)}</span> : <span>livre {brl(e.livre)}</span>}
            </div>
          </div>
        ))}
        {detalhe.etapas.length === 0 && <div className="empty">Sem etapas ainda.</div>}

        <h2 className="section">Fluxo de pagamento <button className="more" onClick={() => { setForm({ pgStatus: "agendado", pgConta: contas[0]?.id ?? "", pgData: hojeISO() }); setPagtoModal(true); }}>+ novo pagamento</button></h2>
        <div className="fluxo-sub">A pagar</div>
        {agendados.length === 0 && <div className="empty">Nada agendado.</div>}
        {agendados.map((p) => (
          <div key={p.id} className={`fluxo-row${p.ativa ? "" : " off"}`}>
            <div className="mid">
              <div className="n">{p.descricao}</div>
              <div className="d">{ddmm(p.dataPrevista)} · {nomeEtapa(p.etapaId)} · {nomeConta(p.contaId)}</div>
            </div>
            <span className="v">{brl(p.valor)}</span>
            <button className="btn mini" onClick={async () => { await api("POST", `/pagamentos/${p.id}/pagar`, {}); aoMudar(); }}>Pagar</button>
            <label className="switch sm"><input type="checkbox" checked={p.ativa} onChange={async () => { await api("PATCH", `/pagamentos/${p.id}`, { ativa: !p.ativa }); aoMudar(); }} /><span className="sl" /></label>
          </div>
        ))}
        <div className="fluxo-sub">Pagos</div>
        {pagos.length === 0 && <div className="empty">Nenhum pagamento consolidado.</div>}
        {pagos.map((p) => (
          <div key={p.id} className="fluxo-row pago">
            <div className="mid">
              <div className="n">{p.descricao}</div>
              <div className="d">pago em {p.dataPagamento ? ddmm(p.dataPagamento) : "—"} · {nomeEtapa(p.etapaId)}</div>
            </div>
            <span className="v">{brl(p.valor)}</span>
          </div>
        ))}

        {etapaModal && (
          <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setEtapaModal(false)}>
            <div className="modal">
              <h3>Nova etapa</h3>
              <div className="field"><label>Nome da etapa</label><input value={form.etNome ?? ""} onChange={(e) => setForm({ ...form, etNome: e.target.value })} /></div>
              <div className="field"><label>Budget da etapa (R$)</label><input inputMode="decimal" value={form.etBudget ?? ""} onChange={(e) => setForm({ ...form, etBudget: e.target.value })} /></div>
              <button className="btn" onClick={async () => {
                await api("POST", `/projetos/${detalhe.id}/etapas`, { nome: form.etNome, budget: Number((form.etBudget ?? "0").replace(",", ".")) });
                setEtapaModal(false); aoMudar();
              }}>Criar etapa</button>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setEtapaModal(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {pagtoModal && (
          <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setPagtoModal(false)}>
            <div className="modal">
              <h3>Novo pagamento</h3>
              <div className="field"><label>Descrição</label><input value={form.pgDesc ?? ""} onChange={(e) => setForm({ ...form, pgDesc: e.target.value })} /></div>
              <div className="row2">
                <div className="field"><label>Valor (R$)</label><input inputMode="decimal" value={form.pgValor ?? ""} onChange={(e) => setForm({ ...form, pgValor: e.target.value })} /></div>
                <div className="field"><label>Data prevista</label><input type="date" value={form.pgData ?? ""} onChange={(e) => setForm({ ...form, pgData: e.target.value })} /></div>
              </div>
              <div className="row2">
                <div className="field"><label>Etapa</label>
                  <select value={form.pgEtapa ?? ""} onChange={(e) => setForm({ ...form, pgEtapa: e.target.value })}>
                    <option value="">— sem etapa —</option>
                    {detalhe.etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>
                <div className="field"><label>Conta</label>
                  <select value={form.pgConta ?? ""} onChange={(e) => setForm({ ...form, pgConta: e.target.value })}>
                    {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Situação</label>
                <select value={form.pgStatus ?? "agendado"} onChange={(e) => setForm({ ...form, pgStatus: e.target.value })}>
                  <option value="agendado">Agendado (entra nas projeções)</option>
                  <option value="pago">Já pago (consolida o realizado agora)</option>
                </select>
              </div>
              <button className="btn" onClick={async () => {
                await api("POST", `/projetos/${detalhe.id}/pagamentos`, {
                  descricao: form.pgDesc,
                  valor: Number((form.pgValor ?? "0").replace(",", ".")),
                  dataPrevista: form.pgData,
                  etapaId: form.pgEtapa || undefined,
                  contaId: form.pgConta,
                  jaPago: form.pgStatus === "pago",
                });
                setPagtoModal(false); aoMudar();
              }}>Salvar</button>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setPagtoModal(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2 className="section">Projetos <button className="more" onClick={() => { setForm({}); setNovoModal(true); }}>+ novo projeto</button></h2>
      {projetos.length === 0 && <div className="empty">Nenhum projeto. Projetos têm budget próprio e ficam fora dos baldes.</div>}
      {projetos.map((p) => (
        <div key={p.id} className={`proj-card${p.ativo ? "" : " proj-off"}`}>
          <div className="proj-head">
            <div className="n" style={{ cursor: "pointer" }} onClick={() => setAberto(p.id)}>{p.nome}</div>
            <label className="switch"><input type="checkbox" checked={p.ativo} onChange={() => toggleProjeto(p)} /><span className="sl" /></label>
          </div>
          <div onClick={() => setAberto(p.id)} style={{ cursor: "pointer" }}>
            {barra(p.realizado, p.comprometido, Number(p.budgetTotal))}
            <div className="proj-nums">
              <span>realizado {brl(p.realizado)}</span>
              <span>comprometido {brl(p.comprometido)}</span>
              <span>{p.livre < 0 ? <span className="over-flag">estouro {brl(-p.livre)}</span> : `livre ${brl(p.livre)}`}</span>
            </div>
          </div>
        </div>
      ))}

      {novoModal && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setNovoModal(false)}>
          <div className="modal">
            <h3>Novo projeto</h3>
            <div className="field"><label>Nome</label><input value={form.pjNome ?? ""} onChange={(e) => setForm({ ...form, pjNome: e.target.value })} /></div>
            <div className="field"><label>Budget total (R$)</label><input inputMode="decimal" value={form.pjBudget ?? ""} onChange={(e) => setForm({ ...form, pjBudget: e.target.value })} /></div>
            <div className="note">Projetos ficam <strong>fora dos baldes</strong>: os gastos não consomem as metas mensais.</div>
            <button className="btn" onClick={async () => {
              await api("POST", "/projetos", { nome: form.pjNome, budgetTotal: Number((form.pjBudget ?? "0").replace(",", ".")) });
              setNovoModal(false); aoMudar();
            }}>Criar projeto</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setNovoModal(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
