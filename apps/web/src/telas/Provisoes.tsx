import { useEffect, useState } from "react";
import { api, brl } from "../api";

interface Painel {
  servicosMensais: Array<{ id: string; nome: string; valor: string | null; dia: number | null; tipo: string; tipoValor: string | null; ativa: boolean }>;
  naoMensais: Array<{ id: string; nome: string; valor: string | null; dia: number | null; mesVencimento: number | null; recorrencia: string; reservaMensal: number }>;
  creditos: Array<{ id: string; nome: string; banco: string; sistema: string; posicao: { totalParcelas: number; restantes: number; parcelaCorrente: { valor: number } | null } }>;
  resumo: { servicosMensais: number; reservaNaoMensais: number; creditoMensal: number; provisionamentoFixoMensal: number };
}

const MESES_N = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function Provisoes({ recarga, aoMudar }: { recarga: number; aoMudar: () => void }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [contas, setContas] = useState<Array<{ id: string; nome: string }>>([]);
  const [baldes, setBaldes] = useState<Array<{ id: string; nome: string }>>([]);
  const [modal, setModal] = useState<"servico" | "naomensal" | "credito" | null>(null);
  const [cronograma, setCronograma] = useState<{ nome: string; parcelas: Array<{ numero: number; vencimento: string; amortizacao: number; juros: number; valor: number }> } | null>(null);
  const [f, setF] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Painel>("GET", "/provisoes/painel").then(setPainel);
    api<Array<{ id: string; nome: string }>>("GET", "/contas").then(setContas);
    api<{ baldes: Array<{ id: string; nome: string }> }>("GET", "/baldes").then((r) => setBaldes(r.baldes));
  }, [recarga]);

  if (!painel) return <div className="spin">Carregando…</div>;
  const r = painel.resumo;

  async function excluir(id: string) {
    await api("DELETE", `/provisoes/${id}`);
    aoMudar();
  }

  return (
    <section>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="prov-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div className="cell"><div className="k">Serviços mensais</div><div className="v">{brl(r.servicosMensais)}</div></div>
          <div className="cell"><div className="k">Reserva não mensais</div><div className="v">{brl(r.reservaNaoMensais)}</div></div>
          <div className="cell"><div className="k">Crédito mensal</div><div className="v">{brl(r.creditoMensal)}</div></div>
          <div className="cell"><div className="k">Fixo por mês</div><div className="v neg">{brl(r.provisionamentoFixoMensal)}</div></div>
        </div>
        <div style={{ fontSize: "11.5px", color: "var(--ink-muted)", textAlign: "center", marginTop: 8 }}>
          Faturas de cartão ficam de fora (variáveis) — acompanhe na tela Cartões. Toggles de projeção vivem no Extrato.
        </div>
      </div>

      <div className="prov-group">
        <div className="g-head"><span className="t">Serviços mensais</span>
          <button className="more" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600 }} onClick={() => { setF({ tipo: "saida" }); setModal("servico"); }}>+ adicionar serviço</button>
        </div>
        {painel.servicosMensais.length === 0 && <div className="empty">Nenhum serviço mensal.</div>}
        {painel.servicosMensais.map((p) => (
          <div key={p.id} className="prov-row">
            <div className="mid">
              <div className="n">{p.nome}{p.tipoValor === "variavel" && " · valor variável"}</div>
              <div className="d">dia {p.dia ?? "—"}{p.tipo === "entrada" ? " · entrada" : ""}</div>
            </div>
            <span className={`v${p.tipo === "entrada" ? " in" : ""}`}>{brl(p.valor)}</span>
            <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => excluir(p.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="prov-group">
        <div className="g-head"><span className="t">Não mensais (IPTU, seguros, anuidades)</span>
          <button className="more" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600 }} onClick={() => { setF({ freq: "anual" }); setModal("naomensal"); }}>+ nova</button>
        </div>
        {painel.naoMensais.length === 0 && <div className="empty">Nenhuma provisão não mensal.</div>}
        {painel.naoMensais.map((p) => (
          <div key={p.id} className="prov-row">
            <div className="mid">
              <div className="n">{p.nome}</div>
              <div className="d">{p.recorrencia} · vence {p.dia ?? "—"}/{MESES_N[p.mesVencimento ?? 0]} · reserva {brl(p.reservaMensal)}/mês</div>
            </div>
            <span className="v">{brl(p.valor)}</span>
            <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => excluir(p.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="prov-group">
        <div className="g-head"><span className="t">Operações de crédito</span>
          <button className="more" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600 }} onClick={() => { setF({ sistema: "price" }); setModal("credito"); }}>+ nova</button>
        </div>
        {painel.creditos.length === 0 && <div className="empty">Nenhuma operação de crédito.</div>}
        {painel.creditos.map((c) => (
          <div key={c.id} className="prov-row">
            <div className="mid">
              <div className="n">{c.nome} · {c.banco}</div>
              <div className="d">{c.sistema.toUpperCase()} · {c.posicao.restantes} de {c.posicao.totalParcelas} parcelas restantes</div>
            </div>
            <span className="v">{brl(c.posicao.parcelaCorrente?.valor ?? 0)}</span>
            <button className="btn mini" onClick={async () => {
              const cr = await api<{ credito: { nome: string }; parcelas: Array<{ numero: number; vencimento: string; amortizacao: number; juros: number; valor: number }> }>("GET", `/creditos/${c.id}/cronograma`);
              setCronograma({ nome: cr.credito.nome, parcelas: cr.parcelas });
            }}>Projetar parcelas</button>
          </div>
        ))}
      </div>

      {modal === "servico" && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <h3>Novo serviço mensal</h3>
            <div className="field"><label>Nome</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div className="row2">
              <div className="field"><label>Valor mensal (R$)</label><input inputMode="decimal" value={f.valor ?? ""} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
              <div className="field"><label>Dia de vencimento</label><input inputMode="numeric" value={f.dia ?? ""} onChange={(e) => setF({ ...f, dia: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Tipo</label>
                <select value={f.tipo ?? "saida"} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="saida">Saída</option><option value="entrada">Entrada (ex.: salário)</option></select>
              </div>
              <div className="field"><label>Valor</label>
                <select value={f.tipoValor ?? "fixo"} onChange={(e) => setF({ ...f, tipoValor: e.target.value })}><option value="fixo">Fixo</option><option value="variavel">Variável</option></select>
              </div>
            </div>
            {f.tipoValor === "variavel" && (
              <div className="field"><label>Dia de conferência do valor</label><input inputMode="numeric" value={f.diaConf ?? ""} onChange={(e) => setF({ ...f, diaConf: e.target.value })} /></div>
            )}
            <div className="row2">
              <div className="field"><label>Conta que paga</label>
                <select value={f.conta ?? ""} onChange={(e) => setF({ ...f, conta: e.target.value })}>
                  <option value="">—</option>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="field"><label>Balde</label>
                <select value={f.balde ?? ""} onChange={(e) => setF({ ...f, balde: e.target.value })}>
                  <option value="">—</option>
                  {baldes.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
            </div>
            <button className="btn" onClick={async () => {
              await api("POST", "/provisoes", {
                nome: f.nome, tipo: f.tipo ?? "saida", valor: Number((f.valor ?? "0").replace(",", ".")),
                dia: Number(f.dia), recorrencia: "mensal",
                contaId: f.conta || undefined, baldeId: f.balde || undefined,
                tipoValor: f.tipoValor ?? "fixo",
                diaConferencia: f.diaConf ? Number(f.diaConf) : undefined,
              });
              setModal(null); aoMudar();
            }}>Salvar</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {modal === "naomensal" && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <h3>Nova provisão não mensal</h3>
            <div className="field"><label>Nome</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: IPTU" /></div>
            <div className="row2">
              <div className="field"><label>Valor total (R$)</label><input inputMode="decimal" value={f.valor ?? ""} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
              <div className="field"><label>Frequência</label>
                <select value={f.freq ?? "anual"} onChange={(e) => setF({ ...f, freq: e.target.value })}>
                  <option value="anual">Anual</option><option value="semestral">Semestral</option><option value="trimestral">Trimestral</option>
                </select>
              </div>
            </div>
            <div className="row2">
              <div className="field"><label>Mês de vencimento</label>
                <select value={f.mes ?? "1"} onChange={(e) => setF({ ...f, mes: e.target.value })}>
                  {MESES_N.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="field"><label>Dia</label><input inputMode="numeric" value={f.dia ?? ""} onChange={(e) => setF({ ...f, dia: e.target.value })} /></div>
            </div>
            <div className="field"><label>Conta de débito</label>
              <select value={f.conta ?? ""} onChange={(e) => setF({ ...f, conta: e.target.value })}>
                <option value="">—</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="note">O valor entra no fluxo de caixa no mês do vencimento. A reserva mensal (valor ÷ meses) aparece para você provisionar.</div>
            <button className="btn" onClick={async () => {
              await api("POST", "/provisoes", {
                nome: f.nome, tipo: "saida", valor: Number((f.valor ?? "0").replace(",", ".")),
                dia: Number(f.dia), mesVencimento: Number(f.mes ?? 1), recorrencia: f.freq ?? "anual",
                contaId: f.conta || undefined,
              });
              setModal(null); aoMudar();
            }}>Salvar</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {modal === "credito" && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <h3>Nova operação de crédito</h3>
            <div className="row2">
              <div className="field"><label>Nome</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Financiamento apto" /></div>
              <div className="field"><label>Banco</label><input value={f.banco ?? ""} onChange={(e) => setF({ ...f, banco: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Valor contratado (R$)</label><input inputMode="decimal" value={f.principal ?? ""} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
              <div className="field"><label>Taxa (% a.m.)</label><input inputMode="decimal" value={f.taxa ?? ""} onChange={(e) => setF({ ...f, taxa: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Sistema</label>
                <select value={f.sistema ?? "price"} onChange={(e) => setF({ ...f, sistema: e.target.value })}><option value="price">PRICE</option><option value="sac">SAC</option></select>
              </div>
              <div className="field"><label>Dia de vencimento</label><input inputMode="numeric" value={f.dia ?? ""} onChange={(e) => setF({ ...f, dia: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Início (AAAA-MM)</label><input value={f.inicio ?? ""} onChange={(e) => setF({ ...f, inicio: e.target.value })} placeholder="2026-01" /></div>
              <div className="field"><label>Fim (AAAA-MM)</label><input value={f.fim ?? ""} onChange={(e) => setF({ ...f, fim: e.target.value })} placeholder="2030-12" /></div>
            </div>
            <div className="field"><label>Conta de débito</label>
              <select value={f.conta ?? ""} onChange={(e) => setF({ ...f, conta: e.target.value })}>
                <option value="">—</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <button className="btn" onClick={async () => {
              await api("POST", "/creditos", {
                nome: f.nome, banco: f.banco, sistema: f.sistema ?? "price",
                taxaMes: Number((f.taxa ?? "0").replace(",", ".")),
                principal: Number((f.principal ?? "0").replace(",", ".")),
                inicio: f.inicio, fim: f.fim, diaVencimento: Number(f.dia),
                contaId: f.conta || undefined,
              });
              setModal(null); aoMudar();
            }}>Salvar</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {cronograma && (
        <div className="modal-back modal-top open" onClick={(e) => e.target === e.currentTarget && setCronograma(null)}>
          <div className="modal">
            <h3>Projeção de parcelas — {cronograma.nome}</h3>
            <div style={{ maxHeight: "52dvh", overflowY: "auto" }}>
              <table className="dfc">
                <thead><tr><th style={{ textAlign: "left" }}>Nº</th><th style={{ textAlign: "left" }}>Venc.</th><th>Amort.</th><th>Juros</th><th>Parcela</th></tr></thead>
                <tbody>
                  {cronograma.parcelas.map((p) => (
                    <tr key={p.numero}>
                      <td className="data">{p.numero}</td>
                      <td className="data">{p.vencimento.slice(8, 10)}/{p.vencimento.slice(5, 7)}/{p.vencimento.slice(2, 4)}</td>
                      <td>{p.amortizacao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td>{p.juros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td><strong>{p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setCronograma(null)}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
}
