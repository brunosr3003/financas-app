import { useEffect, useState } from "react";
import { api, brl, hojeISO } from "../api";

interface Props { fechar: () => void; aoMudar: () => void }
type Aba = "contas" | "cartoes" | "reservas" | "baldes" | "membros";

export function Cadastros({ fechar, aoMudar }: Props) {
  const [aba, setAba] = useState<Aba>("contas");
  const [contas, setContas] = useState<Array<{ id: string; nome: string; banco: string; saldoInicial: string; dataSaldoInicial: string; arquivada: boolean }>>([]);
  const [cartoes, setCartoes] = useState<Array<{ id: string; nome: string; limite: string; diaFechamento: number; diaVencimento: number }>>([]);
  const [reservas, setReservas] = useState<Array<{ id: string; nome: string; meta: string; total: number; progresso: number | null; aplicacoes: Array<{ id: string; instituicao: string; produto: string; valorAtual: string }> }>>([]);
  const [baldes, setBaldes] = useState<Array<{ id: string; nome: string; pct: string }>>([]);
  const [somaPct, setSomaPct] = useState(100);
  const [renda, setRenda] = useState("");
  const [membros, setMembros] = useState<Array<{ id: string; nome: string; email: string; papel: string }>>([]);
  const [f, setF] = useState<Record<string, string>>({});
  const [sub, setSub] = useState<string | null>(null);

  function carregar() {
    api<typeof contas>("GET", "/contas").then(setContas);
    api<typeof cartoes>("GET", "/cartoes").then(setCartoes);
    api<typeof reservas>("GET", "/reservas").then(setReservas);
    api<{ baldes: typeof baldes; somaPct: number }>("GET", "/baldes").then((r) => { setBaldes(r.baldes); setSomaPct(r.somaPct); });
    api<{ rendaBase: string }>("GET", "/config").then((c) => setRenda(String(c.rendaBase)));
    api<typeof membros>("GET", "/membros").then(setMembros).catch(() => setMembros([]));
  }
  useEffect(carregar, []);

  const abas: Array<[Aba, string]> = [["contas", "Contas"], ["cartoes", "Cartões"], ["reservas", "Reservas"], ["baldes", "Baldes & renda"], ["membros", "Membros"]];

  return (
    <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal">
        <h3>Cadastros</h3>
        <div className="chips" style={{ paddingTop: 0 }}>
          {abas.map(([id, nome]) => (
            <button key={id} className={`chip${aba === id ? " active" : ""}`} onClick={() => { setAba(id); setSub(null); setF({}); }}>{nome}</button>
          ))}
        </div>

        {aba === "contas" && (
          <>
            {contas.map((c) => (
              <div key={c.id} className="acct-row">
                <div className="n">{c.nome}<span style={{ color: "var(--ink-muted)", fontSize: 12 }}> · {c.banco} · desde {c.dataSaldoInicial}</span></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="v">{brl(c.saldoInicial)}</span>
                  {!c.arquivada && contas.filter((x) => !x.arquivada).length > 1 && (
                    <button className="iconbtn" style={{ width: 26, height: 26 }} title="Arquivar" onClick={async () => { await api("PATCH", `/contas/${c.id}`, { arquivada: true }); carregar(); aoMudar(); }}>✕</button>
                  )}
                </div>
              </div>
            ))}
            {sub === "nova" ? (
              <div style={{ marginTop: 10 }}>
                <div className="row2">
                  <div className="field"><label>Nome</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
                  <div className="field"><label>Banco</label><input value={f.banco ?? ""} onChange={(e) => setF({ ...f, banco: e.target.value })} /></div>
                </div>
                <div className="row2">
                  <div className="field"><label>Saldo inicial (R$)</label><input inputMode="decimal" value={f.saldo ?? ""} onChange={(e) => setF({ ...f, saldo: e.target.value })} /></div>
                  <div className="field"><label>Data do saldo</label><input type="date" value={f.data ?? hojeISO()} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
                </div>
                <button className="btn" onClick={async () => {
                  await api("POST", "/contas", { nome: f.nome, banco: f.banco, saldoInicial: Number((f.saldo ?? "0").replace(",", ".")), dataSaldoInicial: f.data ?? hojeISO() });
                  setSub(null); setF({}); carregar(); aoMudar();
                }}>Salvar conta</button>
              </div>
            ) : (
              <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setSub("nova")}>+ nova conta</button>
            )}
          </>
        )}

        {aba === "cartoes" && (
          <>
            {cartoes.map((c) => (
              <div key={c.id} className="acct-row">
                <div className="n">{c.nome}<span style={{ color: "var(--ink-muted)", fontSize: 12 }}> · fecha {c.diaFechamento} · vence {c.diaVencimento}</span></div>
                <span className="v">{brl(c.limite)}</span>
              </div>
            ))}
            {sub === "novo" ? (
              <div style={{ marginTop: 10 }}>
                <div className="row2">
                  <div className="field"><label>Nome</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
                  <div className="field"><label>Limite (R$)</label><input inputMode="decimal" value={f.limite ?? ""} onChange={(e) => setF({ ...f, limite: e.target.value })} /></div>
                </div>
                <div className="row2">
                  <div className="field"><label>Dia de fechamento</label><input inputMode="numeric" value={f.fecha ?? ""} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
                  <div className="field"><label>Dia de vencimento</label><input inputMode="numeric" value={f.vence ?? ""} onChange={(e) => setF({ ...f, vence: e.target.value })} /></div>
                </div>
                <div className="note">Sem conta de pagamento: a fatura é um boleto — a conta é escolhida na hora de pagar (RN-04).</div>
                <button className="btn" onClick={async () => {
                  await api("POST", "/cartoes", { nome: f.nome, limite: Number((f.limite ?? "0").replace(",", ".")), diaFechamento: Number(f.fecha), diaVencimento: Number(f.vence) });
                  setSub(null); setF({}); carregar(); aoMudar();
                }}>Salvar cartão</button>
              </div>
            ) : (
              <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setSub("novo")}>+ novo cartão</button>
            )}
          </>
        )}

        {aba === "reservas" && (
          <>
            {reservas.map((r) => (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <div className="acct-row">
                  <div className="n"><strong>{r.nome}</strong>{r.progresso != null && <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{r.progresso.toFixed(0)}% de {brl(r.meta)}</span>}</div>
                  <span className="v">{brl(r.total)}</span>
                </div>
                {r.aplicacoes.map((a) => (
                  <div key={a.id} className="acct-row" style={{ paddingLeft: 14, fontSize: 13 }}>
                    <div className="n" style={{ color: "var(--ink-2)" }}>{a.instituicao} · {a.produto}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className="v" style={{ fontWeight: 500 }}>{brl(a.valorAtual)}</span>
                      <button className="iconbtn" style={{ width: 26, height: 26 }} title="Rendimento/custo" onClick={() => { setSub(`mov:${a.id}`); setF({ tipoMov: "rendimento" }); }}>±</button>
                    </div>
                  </div>
                ))}
                <button className="more" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600, padding: "4px 0 0 14px" }} onClick={() => { setSub(`apl:${r.id}`); setF({}); }}>+ nova aplicação</button>
              </div>
            ))}
            {sub?.startsWith("apl:") && (
              <div style={{ marginTop: 10 }}>
                <div className="row2">
                  <div className="field"><label>Banco / corretora</label><input value={f.inst ?? ""} onChange={(e) => setF({ ...f, inst: e.target.value })} /></div>
                  <div className="field"><label>Produto</label><input value={f.prod ?? ""} onChange={(e) => setF({ ...f, prod: e.target.value })} /></div>
                </div>
                <div className="field"><label>Valor atual (R$)</label><input inputMode="decimal" value={f.valor ?? ""} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
                <button className="btn" onClick={async () => {
                  await api("POST", `/reservas/${sub.slice(4)}/aplicacoes`, { instituicao: f.inst, produto: f.prod, valorAtual: Number((f.valor ?? "0").replace(",", ".")) });
                  setSub(null); carregar(); aoMudar();
                }}>Salvar aplicação</button>
              </div>
            )}
            {sub?.startsWith("mov:") && (
              <div style={{ marginTop: 10 }}>
                <div className="row2">
                  <div className="field"><label>Tipo</label>
                    <select value={f.tipoMov ?? "rendimento"} onChange={(e) => setF({ ...f, tipoMov: e.target.value })}>
                      <option value="rendimento">Rendimento (+)</option><option value="custo">Custo / taxa (−)</option>
                    </select>
                  </div>
                  <div className="field"><label>Valor (R$)</label><input inputMode="decimal" value={f.valor ?? ""} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
                </div>
                <button className="btn" onClick={async () => {
                  await api("POST", `/aplicacoes/${sub.slice(4)}/movimentos`, { tipo: f.tipoMov ?? "rendimento", valor: Number((f.valor ?? "0").replace(",", ".")), data: hojeISO() });
                  setSub(null); carregar(); aoMudar();
                }}>Aplicar</button>
              </div>
            )}
            {sub === "nova" ? (
              <div style={{ marginTop: 10 }}>
                <div className="field"><label>Objetivo</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Reserva de emergência" /></div>
                <div className="field"><label>Meta (R$)</label><input inputMode="decimal" value={f.meta ?? ""} onChange={(e) => setF({ ...f, meta: e.target.value })} /></div>
                <button className="btn" onClick={async () => {
                  await api("POST", "/reservas", { nome: f.nome, meta: Number((f.meta ?? "0").replace(",", ".")) });
                  setSub(null); carregar(); aoMudar();
                }}>Salvar reserva</button>
              </div>
            ) : (
              !sub && <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => { setSub("nova"); setF({}); }}>+ nova reserva</button>
            )}
          </>
        )}

        {aba === "baldes" && (
          <>
            <div className="field"><label>Renda-base mensal (R$)</label>
              <input inputMode="decimal" value={renda} onChange={(e) => setRenda(e.target.value)} onBlur={async () => { await api("PATCH", "/config", { rendaBase: Number(renda.replace(",", ".")) }); aoMudar(); }} />
            </div>
            {baldes.map((b) => (
              <div key={b.id} className="acct-row">
                <div className="n">{b.nome}</div>
                <input style={{ width: 70, padding: "6px 8px", border: "1px solid var(--baseline)", borderRadius: 6, background: "var(--page)", textAlign: "right" }}
                  defaultValue={Number(b.pct)}
                  onBlur={async (e) => { await api("PATCH", `/baldes/${b.id}`, { pct: Number(e.target.value.replace(",", ".")) }); carregar(); aoMudar(); }} />
              </div>
            ))}
            <div className={somaPct === 100 ? "note" : "msg error"} style={{ marginTop: 8 }}>
              Soma dos percentuais: {somaPct}% {somaPct !== 100 && "— deve fechar em 100% (RN-01)"}
            </div>
          </>
        )}

        {aba === "membros" && (
          <>
            {membros.map((m) => (
              <div key={m.id} className="acct-row">
                <div className="n">{m.nome}<span style={{ color: "var(--ink-muted)", fontSize: 12 }}> · {m.email}</span></div>
                <span className={`badge ${m.papel === "proprietario" ? "aberta" : "proj"}`}>{m.papel}</span>
              </div>
            ))}
            {sub === "novo" ? (
              <div style={{ marginTop: 10 }}>
                <div className="row2">
                  <div className="field"><label>Nome</label><input value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
                  <div className="field"><label>Email</label><input value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
                </div>
                <div className="row2">
                  <div className="field"><label>Senha inicial</label><input value={f.senha ?? ""} onChange={(e) => setF({ ...f, senha: e.target.value })} /></div>
                  <div className="field"><label>Papel</label>
                    <select value={f.papel ?? "membro"} onChange={(e) => setF({ ...f, papel: e.target.value })}><option value="membro">Membro</option><option value="proprietario">Proprietário</option></select>
                  </div>
                </div>
                <button className="btn" onClick={async () => {
                  await api("POST", "/membros", { nome: f.nome, email: f.email, senha: f.senha, papel: f.papel ?? "membro" });
                  setSub(null); carregar();
                }}>Adicionar membro</button>
              </div>
            ) : (
              <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setSub("novo")}>+ adicionar membro</button>
            )}
          </>
        )}

        <button className="btn secondary" style={{ marginTop: 10 }} onClick={fechar}>Fechar</button>
      </div>
    </div>
  );
}
