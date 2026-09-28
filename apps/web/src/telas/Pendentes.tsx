import { api, brl, ddmm } from "../api";

export interface Pendente {
  id: string;
  descricao: string;
  valor: string;
  data: string;
  origem: string;
  tipo: string;
  parcelaNum: number | null;
  parcelaTotal: number | null;
}

export function Pendentes({
  itens,
  fechar,
  aoMudar,
}: {
  itens: Pendente[];
  fechar: () => void;
  aoMudar: () => void;
}) {
  async function confirmarTodos() {
    for (const i of itens) await api("POST", `/transacoes/${i.id}/confirmar`).catch(() => undefined);
    aoMudar();
  }

  return (
    <div className="modal-back open" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal">
        <h3>Lançamentos pendentes</h3>
        <div className="note">
          Criados pelo Claude (MCP) ou importação — só entram nos números depois que você confirmar.
        </div>
        {itens.length === 0 && <div className="empty">Nada pendente. Tudo em dia!</div>}
        {itens.map((i) => (
          <div key={i.id} className="prov-row">
            <div className="mid">
              <div className="n">{i.descricao}</div>
              <div className="d">
                {ddmm(i.data)} · {i.origem === "cartao" ? "cartão" : "conta"}
                {i.tipo === "entrada" ? " · entrada" : ""}
              </div>
            </div>
            <span className={`v${i.tipo === "entrada" ? " in" : ""}`}>{brl(i.valor)}</span>
            <button
              className="btn mini"
              onClick={async () => {
                await api("POST", `/transacoes/${i.id}/confirmar`);
                aoMudar();
              }}
            >
              ✓
            </button>
            <button
              className="iconbtn"
              style={{ width: 30, height: 30 }}
              title="Rejeitar"
              onClick={async () => {
                await api("DELETE", `/transacoes/${i.id}`);
                aoMudar();
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {itens.length > 1 && (
          <button className="btn" style={{ marginTop: 6 }} onClick={confirmarTodos}>
            Confirmar todos ({itens.length})
          </button>
        )}
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={fechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
