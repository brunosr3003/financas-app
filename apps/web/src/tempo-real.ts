import { getToken } from "./api";

/**
 * Conecta no stream SSE /api/eventos (fetch com Authorization — EventSource
 * nao suporta header). Reconecta sozinho; retorna funcao para desconectar.
 */
export function conectarEventos(onEvento: () => void): () => void {
  let ativo = true;
  let ctrl: AbortController | null = null;
  let ultimo = 0;

  const avisar = () => {
    // debounce: rajadas de eventos viram um refresh so
    const agora = Date.now();
    if (agora - ultimo < 400) return;
    ultimo = agora;
    onEvento();
  };

  async function loop() {
    while (ativo) {
      try {
        ctrl = new AbortController();
        const res = await fetch("/api/eventos", {
          headers: { authorization: `Bearer ${getToken()}` },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (ativo) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const partes = buf.split("\n\n");
          buf = partes.pop() ?? "";
          for (const p of partes) {
            if (p.startsWith("data:")) avisar();
          }
        }
      } catch {
        /* reconecta abaixo */
      }
      if (ativo) await new Promise((r) => setTimeout(r, 3000));
    }
  }

  void loop();
  return () => {
    ativo = false;
    ctrl?.abort();
  };
}
