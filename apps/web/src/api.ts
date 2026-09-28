const BASE = "/api";

export function getToken(): string | null {
  return localStorage.getItem("cofre_token");
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem("cofre_token", t);
  else localStorage.removeItem("cofre_token");
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export async function api<T = unknown>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${rota}`, {
    method: metodo,
    headers: {
      // content-type so quando ha corpo: JSON vazio e rejeitado pelo Fastify
      ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (res.status === 401 && !rota.startsWith("/auth/")) {
    setToken(null);
    window.location.reload();
  }
  if (res.status === 402) {
    window.dispatchEvent(new Event("assinatura-inativa"));
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const m = (json as { message?: string; error?: string } | null) ?? {};
    throw new ApiError(res.status, m.message ?? m.error ?? `Erro ${res.status}`);
  }
  return json as T;
}

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (n: number | string | null | undefined) => fmt.format(Number(n ?? 0));

export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export function nomeMes(yyyymm: string): string {
  const [a, m] = yyyymm.split("-").map(Number);
  return `${NOMES_MES[(m ?? 1) - 1]} ${a}`;
}
export function addMesStr(yyyymm: string, delta: number): string {
  const [a, m] = yyyymm.split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
