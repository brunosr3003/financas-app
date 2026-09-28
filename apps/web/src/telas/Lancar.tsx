import { useEffect, useState } from "react";
import { api, ddmm, hojeISO } from "../api";

interface Props { fechar: () => void; aoMudar: () => void }

export function Lancar({ fechar, aoMudar }: Props) {
  const [origem, setOrigem] = useState<"conta" | "cartao">("conta");
  const [tipo, setTipo] = useState<"saida" | "entrada">("saida");
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [contaId, setContaId] = useState("");
  const [cartaoId, setCartaoId] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [faturaId, setFaturaId] = useState("");
  const [forma, setForma] = useState("pix");
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState("");

  const [contas, setContas] = useState<Array<{ id: string; nome: string }>>([]);
  const [cartoes, setCartoes] = useState<Array<{ id: string; nome: string }>>([]);
  const [baldes, setBaldes] = useState<Array<{ id: string; nome: string }>>([]);
  const [projetos, setProjetos] = useState<Array<{ id: string; nome: string }>>([]);
  const [faturas, setFaturas] = useState<Array<{ id: string; cartaoId: string; cicloInicio: string; cicloFim: string; status: string }>>([]);

  useEffect(() => {
    api<Array<{ id: string; nome: string }>>("GET", "/contas").then((c) => { setContas(c); setContaId(c[0]?.id ?? ""); });
    api<Array<{ id: string; nome: string }>>("GET", "/cartoes").then((c) => { setCartoes(c); setCartaoId(c[0]?.id ?? ""); });
    api<{ baldes: Array<{ id: string; nome: string }> }>("GET", "/baldes").then((r) => setBaldes(r.baldes));
    api<Array<{ id: string; nome: string }>>("GET", "/projetos").then(setProjetos);
    api<Array<{ id: string; cartaoId: string; cicloInicio: string; cicloFim: string; status: string }>>("GET", "/faturas").then(setFaturas);
  }, []);

  async function salvar() {
    setErro("");
    try {
      const [tipoDestino, idDestino] = destino ? destino.split(":") : [null, null];
      const base = {
        descricao: desc,
        valor: Number(valor.replace(",", ".")),
        data,
        baldeId: tipoDestino === "b" ? idDestino : undefined,
        projetoId: tipoDestino === "p" ? idDestino : undefined,
      };
      if (origem === "conta") {
        await api("POST", "/transacoes", { origem, tipo, contaId, forma, ...base });
      } else {
        await api("POST", "/transacoes", { origem, tipo: "saida", cartaoId, parcelas, faturaId: faturaId || undefined, ...base });
      }
      aoMudar();
      fechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  const faturasDoCartao = faturas.filter((f) => f.cartaoId === cartaoId);

  return (
    <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal">
        <h3>Novo lançamento</h3>
        <div className="seg">
          <button className={origem === "conta" ? "active" : ""} onClick={() => setOrigem("conta")}>Em conta</button>
          <button className={origem === "cartao" ? "active" : ""} onClick={() => setOrigem("cartao")}>No cartão</button>
        </div>
        {origem === "conta" && (
          <div className="seg">
            <button className={tipo === "saida" ? "active" : ""} onClick={() => setTipo("saida")}>Saída</button>
            <button className={tipo === "entrada" ? "active" : ""} onClick={() => setTipo("entrada")}>Entrada</button>
          </div>
        )}
        <div className="field"><label>Descrição</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Supermercado" /></div>
        <div className="row2">
          <div className="field"><label>Valor (R$)</label><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
          <div className="field"><label>Data</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        </div>
        <div className="row2">
          {origem === "conta" ? (
            <>
              <div className="field"><label>Conta</label>
                <select value={contaId} onChange={(e) => setContaId(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </div>
              <div className="field"><label>Forma</label>
                <select value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="pix">Pix</option><option value="debito">Débito</option><option value="transferencia">Transferência</option><option value="boleto">Boleto</option><option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="field"><label>Cartão</label>
                <select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>{cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </div>
              <div className="field"><label>Parcelas</label>
                <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}x</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        {origem === "cartao" && (
          <div className="field"><label>Fatura de destino</label>
            <select value={faturaId} onChange={(e) => setFaturaId(e.target.value)}>
              <option value="">Automática (pela data da compra)</option>
              {faturasDoCartao.map((fa) => (
                <option key={fa.id} value={fa.id}>{ddmm(fa.cicloInicio)} – {ddmm(fa.cicloFim)} ({fa.status}){fa.status === "paga" ? " · retroativo" : ""}</option>
              ))}
            </select>
          </div>
        )}
        {(origem === "cartao" || tipo === "saida") && (
          <div className="field"><label>Destino do gasto</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">— sem destino —</option>
              <optgroup label="Baldes">{baldes.map((b) => <option key={b.id} value={`b:${b.id}`}>{b.nome}</option>)}</optgroup>
              <optgroup label="Projetos (fora dos baldes)">{projetos.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nome}</option>)}</optgroup>
            </select>
          </div>
        )}
        {origem === "cartao" && (
          <div className="note">Lançamentos no cartão <strong>não saem do caixa agora</strong>: entram na fatura e aumentam a <strong>provisão de pagamento do cartão</strong>. O caixa é afetado no pagamento da fatura.</div>
        )}
        <button className="btn" onClick={salvar}>Lançar</button>
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={fechar}>Cancelar</button>
        {erro && <div className="msg error">{erro}</div>}
      </div>
    </div>
  );
}
