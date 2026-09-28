import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import { conectarEventos } from "./tempo-real";
import { Ajuda } from "./telas/Ajuda";
import { Pendentes, type Pendente } from "./telas/Pendentes";
import { Cadastros } from "./telas/Cadastros";
import { Cartoes } from "./telas/Cartoes";
import { Extrato } from "./telas/Extrato";
import { Lancar } from "./telas/Lancar";
import { Login } from "./telas/Login";
import { Projetos } from "./telas/Projetos";
import { Provisoes } from "./telas/Provisoes";
import { Resumo } from "./telas/Resumo";

type Aba = "resumo" | "cartoes" | "projetos" | "dfc" | "provisoes" | "ajuda";
const TITULOS: Record<Aba, string> = { resumo: "Resumo", cartoes: "Cartões", projetos: "Projetos", dfc: "Extrato & Projeções", provisoes: "Provisões", ajuda: "Ajuda" };

const ABAS_NAV = ["resumo", "cartoes", "projetos", "dfc", "provisoes"] as const;
const ICONES: Record<(typeof ABAS_NAV)[number], JSX.Element> = {
  resumo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="8" rx="1" /><rect x="10" y="7" width="4" height="13" rx="1" /><rect x="17" y="3" width="4" height="17" rx="1" /></svg>,
  cartoes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  projetos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  dfc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></svg>,
  provisoes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
};

export function App() {
  const [logado, setLogado] = useState(!!getToken());
  const [inativa, setInativa] = useState(false);
  const [aba, setAba] = useState<Aba>("resumo");
  const [lancando, setLancando] = useState(false);
  const [cadastros, setCadastros] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [pendentesAberto, setPendentesAberto] = useState(false);
  const mudou = () => setRecarga((r) => r + 1);

  const atualizarPendentes = useCallback(() => {
    api<Pendente[]>("GET", "/pendentes").then(setPendentes).catch(() => undefined);
  }, []);

  useEffect(() => {
    const marcar = () => setInativa(true);
    window.addEventListener("assinatura-inativa", marcar);
    return () => window.removeEventListener("assinatura-inativa", marcar);
  }, []);

  // Tempo real: qualquer mutacao (inclusive via Claude/MCP) atualiza a tela
  useEffect(() => {
    if (!logado || inativa) return;
    atualizarPendentes();
    const desconectar = conectarEventos(() => {
      setRecarga((r) => r + 1);
      atualizarPendentes();
    });
    return desconectar;
  }, [logado, inativa, atualizarPendentes]);

  if (!logado) return <Login onOk={() => { setInativa(false); setLogado(true); }} />;

  if (inativa)
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: "center" }}>
          <h1>Quase lá!</h1>
          <div className="sub" style={{ marginTop: 8 }}>
            Sua conta foi criada e está <strong>aguardando ativação da assinatura</strong>.
            Assim que a ativação for confirmada, é só recarregar.
          </div>
          <button className="btn" onClick={() => { setInativa(false); window.location.reload(); }}>Já fui ativado — recarregar</button>
          <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => { setToken(null); setLogado(false); setInativa(false); }}>Sair</button>
        </div>
      </div>
    );

  return (
    <>
      <header className="appbar">
        <div><span className="title">{TITULOS[aba]}</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          {pendentes.length > 0 && (
            <button className="iconbtn badge-pendentes" title="Lançamentos pendentes" onClick={() => setPendentesAberto(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7" /><path d="M2 13h5l2 3h6l2-3h5v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" /></svg>
              <span className="badge-num">{pendentes.length}</span>
            </button>
          )}
          <button className="iconbtn" title="Ajuda" onClick={() => setAba("ajuda")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.86.83c0 1.67-2.36 2.17-2.36 3.42" /><circle cx="12" cy="16.8" r=".5" fill="currentColor" /></svg>
          </button>
          <button className="iconbtn" title="Cadastros" onClick={() => setCadastros(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button className="iconbtn" title="Sair" onClick={() => { setToken(null); setLogado(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </header>

      <nav className="tabs">
        {ABAS_NAV.map((t) => (
          <button key={t} className={aba === t ? "active" : ""} onClick={() => setAba(t)}>
            {ICONES[t]}
            {t === "dfc" ? "Extrato" : TITULOS[t]}
          </button>
        ))}
      </nav>

      <main>
        {aba === "resumo" && <Resumo recarga={recarga} />}
        {aba === "cartoes" && <Cartoes recarga={recarga} aoMudar={mudou} />}
        {aba === "projetos" && <Projetos recarga={recarga} aoMudar={mudou} />}
        {aba === "dfc" && <Extrato recarga={recarga} aoMudar={mudou} />}
        {aba === "provisoes" && <Provisoes recarga={recarga} aoMudar={mudou} />}
        {aba === "ajuda" && <Ajuda />}
      </main>

      <button className="fab" onClick={() => setLancando(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
        Lançar
      </button>

      {lancando && <Lancar fechar={() => setLancando(false)} aoMudar={mudou} />}
      {cadastros && <Cadastros fechar={() => setCadastros(false)} aoMudar={mudou} />}
      {pendentesAberto && (
        <Pendentes
          itens={pendentes}
          fechar={() => setPendentesAberto(false)}
          aoMudar={() => {
            mudou();
            atualizarPendentes();
          }}
        />
      )}
    </>
  );
}
