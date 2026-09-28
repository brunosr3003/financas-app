import { useEffect, useMemo, useState } from "react";
import { api, brl, ddmm, hojeISO } from "../api";

interface Cartao { id: string; nome: string; limite: string; diaFechamento: number; diaVencimento: number }
interface Fatura { id: string; cartaoId: string; cicloInicio: string; cicloFim: string; vencimento: string; status: string; ajustada: boolean; valorPago: string }
interface Item {
  id: string; faturaId: string | null; descricao: string; valor: string; data: string;
  parcelamentoId: string | null; parcelaNum: number | null; parcelaTotal: number | null;
}
interface ResumoCartao { id: string; utilizado: number; disponivel: number; pctUtilizado: number; alerta: string | null; melhorDiaCompra: string }

export function Cartoes({ recarga, aoMudar }: { recarga: number; aoMudar: () => void }) {
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [resumo, setResumo] = useState<ResumoCartao[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [pagando, setPagando] = useState<Fatura | null>(null);
  const [contas, setContas] = useState<Array<{ id: string; nome: string }>>([]);
  const [pgConta, setPgConta] = useState("");
  const [pgValor, setPgValor] = useState("");
  const hoje = hojeISO();

  useEffect(() => {
    api<Cartao[]>("GET", "/cartoes").then((cs) => {
      setCartoes(cs);
      setSel((s) => s ?? cs[0]?.id ?? null);
    });
    api<{ cartoes: ResumoCartao[] }>("GET", "/resumo").then((r) => setResumo(r.cartoes));
    api<Array<{ id: string; nome: string }>>("GET", "/contas").then(setContas);
  }, [recarga]);

  useEffect(() => {
    if (!sel) return;
    api<Fatura[]>("GET", "/faturas").then((fs) => setFaturas(fs.filter((f) => f.cartaoId === sel)));
    api<Item[]>("GET", `/cartoes/${sel}/busca`).then(setItens);
  }, [sel, recarga]);

  const cartao = cartoes.find((c) => c.id === sel);
  const info = resumo.find((r) => r.id === sel);

  const itensPorFatura = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of itens) {
      if (!i.faturaId) continue;
      if (!m.has(i.faturaId)) m.set(i.faturaId, []);
      m.get(i.faturaId)!.push(i);
    }
    return m;
  }, [itens]);

  const totalFatura = (fid: string) => (itensPorFatura.get(fid) ?? []).reduce((s, i) => s + Number(i.valor), 0);

  const statusEfetivo = (f: Fatura) => (f.status === "paga" ? "paga" : f.cicloFim < hoje ? "fechada" : "aberta");

  const buscaResultados = useMemo(() => {
    if (!busca.trim()) return null;
    const termo = busca.toLowerCase();
    return itens.filter((i) => i.descricao.toLowerCase().includes(termo));
  }, [busca, itens]);

  // Parcelas futuras por mes + parcelamentos ativos (RN-05)
  const parcelasFuturas = useMemo(() => {
    const porMes = new Map<string, number>();
    for (const i of itens) {
      if (i.data > hoje) porMes.set(i.data.slice(0, 7), (porMes.get(i.data.slice(0, 7)) ?? 0) + Number(i.valor));
    }
    return [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8);
  }, [itens, hoje]);

  const parcelamentos = useMemo(() => {
    const grupos = new Map<string, Item[]>();
    for (const i of itens) {
      if (!i.parcelamentoId) continue;
      if (!grupos.has(i.parcelamentoId)) grupos.set(i.parcelamentoId, []);
      grupos.get(i.parcelamentoId)!.push(i);
    }
    return [...grupos.values()]
      .map((g) => {
        const futuras = g.filter((i) => i.data > hoje);
        const atual = g.filter((i) => i.data <= hoje).length;
        return {
          descricao: g[0]!.descricao.replace(/ \(\d+\/\d+\)$/, ""),
          total: g[0]!.parcelaTotal ?? g.length,
          atual,
          valorMensal: Number(g[0]!.valor),
          restante: futuras.reduce((s, i) => s + Number(i.valor), 0),
        };
      })
      .filter((p) => p.restante > 0);
  }, [itens, hoje]);

  const maxParcMes = Math.max(1, ...parcelasFuturas.map(([, v]) => v));

  async function pagar() {
    if (!pagando || !pgConta || !pgValor) return;
    await api("POST", `/faturas/${pagando.id}/pagar`, { contaId: pgConta, valor: Number(pgValor.replace(",", ".")), data: hoje });
    setPagando(null);
    setPgValor("");
    aoMudar();
  }

  if (!cartao) return <div className="empty">Nenhum cartão. Crie em Cadastros (☰) → Cartões.</div>;

  return (
    <section>
      <div className="chips cardsel">
        {cartoes.map((c) => (
          <button key={c.id} className={`chip${c.id === sel ? " active" : ""}`} onClick={() => setSel(c.id)}>{c.nome}</button>
        ))}
      </div>

      <div className="card">
        <div className="cardline" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <div className="top"><span className="n">{cartao.nome}</span><span className="u">{brl(info?.utilizado ?? 0)} de {brl(cartao.limite)}</span></div>
          <div className="limitbar">
            <div className={info?.alerta === "critico" ? "crit" : info?.alerta === "atencao" ? "hi" : ""} style={{ width: `${Math.min(info?.pctUtilizado ?? 0, 100)}%` }} />
          </div>
        </div>
        <div className="bigstat">
          <div className="cell"><div className="k">Disponível</div><div className="v">{brl(info?.disponivel ?? 0)}</div></div>
          <div className="cell"><div className="k">Melhor dia de compra</div><div className="v">{info ? ddmm(info.melhorDiaCompra) : "—"}</div></div>
          <div className="cell"><div className="k">Fecha / vence</div><div className="v">dia {cartao.diaFechamento} / {cartao.diaVencimento}</div></div>
        </div>
      </div>

      <h2 className="section">Faturas — histórico completo</h2>
      <input className="fat-busca" placeholder="Buscar lançamento nas faturas…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="card">
        {buscaResultados ? (
          buscaResultados.length === 0 ? (
            <div className="empty">Nada encontrado para “{busca}”.</div>
          ) : (
            buscaResultados.map((i) => (
              <div key={i.id} className="fat-item"><span>{i.descricao} · {ddmm(i.data)}</span><span className="v">{brl(i.valor)}</span></div>
            ))
          )
        ) : (
          [...faturas]
            .sort((a, b) => b.cicloFim.localeCompare(a.cicloFim))
            .map((f) => {
              const st = statusEfetivo(f);
              const aberta = expandida === f.id;
              return (
                <div key={f.id}>
                  <div className={`fatura-row clicavel${aberta ? " aberta-exp" : ""}`} onClick={() => setExpandida(aberta ? null : f.id)}>
                    <span>
                      <span className="chev">▶</span> {ddmm(f.cicloInicio)} – {ddmm(f.cicloFim)} · vence {ddmm(f.vencimento)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>{brl(totalFatura(f.id))}</strong>
                      <span className={`badge ${f.ajustada ? "ajustada" : st}`}>{f.ajustada ? "ajustada" : st}</span>
                      {st !== "paga" && (
                        <button className="btn mini" onClick={(e) => { e.stopPropagation(); setPagando(f); setPgValor(String(totalFatura(f.id) - Number(f.valorPago))); setPgConta(contas[0]?.id ?? ""); }}>
                          Pagar
                        </button>
                      )}
                    </span>
                  </div>
                  {aberta && (
                    <div className="fat-itens">
                      {(itensPorFatura.get(f.id) ?? []).map((i) => (
                        <div key={i.id} className="fat-item"><span>{i.descricao} · {ddmm(i.data)}</span><span className="v">{brl(i.valor)}</span></div>
                      ))}
                      {(itensPorFatura.get(f.id) ?? []).length === 0 && <div className="fat-item">sem lançamentos</div>}
                    </div>
                  )}
                </div>
              );
            })
        )}
        {faturas.length === 0 && !buscaResultados && <div className="empty">Sem faturas ainda — lance uma compra no cartão.</div>}
      </div>

      <h2 className="section">Parcelas futuras — total a vencer por mês</h2>
      <div className="card">
        {parcelasFuturas.length === 0 && <div className="empty">Nada parcelado a vencer.</div>}
        {parcelasFuturas.map(([mes, valor]) => (
          <div key={mes} className="parc-month">
            <span className="m">{mes.slice(5, 7)}/{mes.slice(0, 4)}</span>
            <div className="bar"><div style={{ width: `${(valor / maxParcMes) * 100}%` }} /></div>
            <span className="val">{brl(valor)}</span>
          </div>
        ))}
      </div>

      <h2 className="section">Parcelamentos ativos</h2>
      <div className="card">
        {parcelamentos.length === 0 && <div className="empty">Nenhum parcelamento ativo.</div>}
        {parcelamentos.map((p, i) => (
          <div key={i} className="parc-item">
            <div>
              <div>{p.descricao}</div>
              <div className="d">parcela {p.atual} de {p.total} · {brl(p.valorMensal)}/mês</div>
            </div>
            <strong>{brl(p.restante)} restante</strong>
          </div>
        ))}
      </div>

      {pagando && (
        <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && setPagando(null)}>
          <div className="modal">
            <h3>Registrar pagamento de fatura</h3>
            <div className="note">Modelo boleto (RN-04): você escolhe a conta de débito agora. Pagamento parcial é suportado.</div>
            <div className="field"><label>Conta de débito</label>
              <select value={pgConta} onChange={(e) => setPgConta(e.target.value)}>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="field"><label>Valor (R$)</label><input inputMode="decimal" value={pgValor} onChange={(e) => setPgValor(e.target.value)} /></div>
            <button className="btn" onClick={pagar}>Confirmar pagamento</button>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setPagando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
