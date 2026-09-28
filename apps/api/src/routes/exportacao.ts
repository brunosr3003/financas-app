import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import * as t from "../db/schema.js";
import { withEmpresa } from "../db/with-empresa.js";
import { dec } from "../seguranca/crypto.js";

function celula(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function exportacaoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Spec 1.2 (exportacao CSV) + LGPD art. 18 (portabilidade dos dados)
  app.get("/export/transacoes.csv", async (req, reply) => {
    const linhas = await withEmpresa(req.user.empresaId, (tx) =>
      tx
        .select()
        .from(t.transacao)
        .where(eq(t.transacao.empresaId, req.user.empresaId))
        .orderBy(asc(t.transacao.data)),
    );
    const cab = "data;tipo;origem;descricao;valor;parcela;pendente";
    const corpo = linhas.map((l) =>
      [
        l.data,
        l.tipo,
        l.origem,
        celula(dec(l.descricao)),
        String(l.valor).replace(".", ","),
        l.parcelaNum ? `${l.parcelaNum}/${l.parcelaTotal}` : "",
        l.pendente ? "sim" : "",
      ].join(";"),
    );
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="transacoes.csv"');
    return [cab, ...corpo].join("\n");
  });
}
