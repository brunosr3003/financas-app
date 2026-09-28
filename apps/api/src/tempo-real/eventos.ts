/**
 * Canal de tempo real (SSE) por empresa: o front escuta /eventos e recebe um
 * aviso a cada mutacao de dados — inclusive as feitas pelo Claude via MCP.
 */
import type { ServerResponse } from "node:http";

const clientes = new Map<string, Set<ServerResponse>>();

export function registrarCliente(empresaId: string, res: ServerResponse): void {
  if (!clientes.has(empresaId)) clientes.set(empresaId, new Set());
  clientes.get(empresaId)!.add(res);
}

export function removerCliente(empresaId: string, res: ServerResponse): void {
  const set = clientes.get(empresaId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientes.delete(empresaId);
}

export function publicar(empresaId: string, evento: Record<string, unknown>): void {
  const set = clientes.get(empresaId);
  if (!set || set.size === 0) return;
  const linha = `data: ${JSON.stringify(evento)}\n\n`;
  for (const res of set) {
    try {
      res.write(linha);
    } catch {
      set.delete(res);
    }
  }
}
