import { useEffect, useRef, useState } from "react";
import { api, setToken } from "../api";

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
  }
}

/** Mascara BR: (DD) 9999-9999 ou (DD) 99999-9999, limitada a 11 digitos */
function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function Login({ onOk }: { onOk: () => void }) {
  const googleDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ clientId: string | null }>("GET", "/auth/google/config").then(({ clientId }) => {
      if (!clientId) return;
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => {
        if (!window.google || !googleDiv.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential: string }) => {
            try {
              const r = await api<{ token: string }>("POST", "/auth/google", { credential: resp.credential });
              setToken(r.token);
              onOk();
            } catch {
              /* erro exibido pelo fluxo normal */
            }
          },
        });
        window.google.accounts.id.renderButton(googleDiv.current, { theme: "outline", size: "large", width: 336, text: "continue_with", locale: "pt-BR" });
      };
      document.head.appendChild(s);
    }).catch(() => undefined);
  }, [onOk]);
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha2, setSenha2] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar() {
    setErro("");
    if (modo === "registro" && senha !== senha2) {
      setErro("As senhas não conferem");
      return;
    }
    setCarregando(true);
    try {
      if (modo === "login") {
        const r = await api<{ token: string }>("POST", "/auth/login", { email, senha });
        setToken(r.token);
      } else {
        const r = await api<{ token: string }>("POST", "/auth/register", { nome, email, senha, telefone });
        setToken(r.token);
      }
      onOk();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cofre</h1>
        <div className="sub">Controle financeiro — contas, cartões, baldes e projeções</div>
        <div ref={googleDiv} style={{ marginBottom: 14, display: "flex", justifyContent: "center" }} />
        <div className="seg">
          <button className={modo === "login" ? "active" : ""} onClick={() => setModo("login")}>Entrar</button>
          <button className={modo === "registro" ? "active" : ""} onClick={() => setModo("registro")}>Criar conta</button>
        </div>
        {modo === "registro" && (
          <>
            <div className="field"><label>Seu nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="field"><label>Telefone (com DDD)</label><input type="tel" inputMode="tel" placeholder="(31) 99999-9999" maxLength={16} value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} /></div>
          </>
        )}
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Senha</label>
          <div className="senha-wrap">
            <input type={verSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} />
            <button type="button" className="olho" title={verSenha ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVerSenha(!verSenha)}>
              {verSenha ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.5 10.5 0 0 1 12 20c-7 0-10-8-10-8a17.9 17.9 0 0 1 4.06-5.06M9.9 4.24A9.9 9.9 0 0 1 12 4c7 0 10 8 10 8a17.9 17.9 0 0 1-2.16 3.19" /><path d="M1 1l22 22" /><circle cx="12" cy="12" r="3" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
        </div>
        {modo === "registro" && (
          <div className="field"><label>Repetir senha</label>
            <input
              type={verSenha ? "text" : "password"}
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              style={senha2 && senha2 !== senha ? { borderColor: "var(--critical)" } : senha2 && senha2 === senha ? { borderColor: "var(--good)" } : undefined}
            />
            {senha2 && senha2 !== senha && <div className="msg error" style={{ marginTop: 4 }}>As senhas não conferem</div>}
          </div>
        )}
        <button className="btn" disabled={carregando} onClick={enviar}>
          {carregando ? "…" : modo === "login" ? "Entrar" : "Criar conta"}
        </button>
        {erro && <div className="msg error">{erro}</div>}
      </div>
    </div>
  );
}
