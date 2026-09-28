/**
 * Servidor MCP do Cofre (usado pelo endpoint remoto /mcp/:token).
 * As tools chamam a propria API via `chamar` (fastify inject) — as regras de
 * negocio, RLS e criptografia ficam num lugar so. Lancamentos entram PENDENTES.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type ChamarApi = <T = unknown>(metodo: string, rota: string, corpo?: unknown) => Promise<T>;

interface Nomeado { id: string; nome: string }

const texto = (v: unknown) => ({
  content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }],
});

export function criarServidorMcp(chamar: ChamarApi): McpServer {
  const server = new McpServer({ name: "cofre-financas", version: "1.0.0" });
  const cache = new Map<string, Nomeado[]>();

  async function listar(recurso: "contas" | "cartoes" | "projetos" | "baldes"): Promise<Nomeado[]> {
    const memo = cache.get(recurso);
    if (memo) return memo;
    let itens: Nomeado[];
    if (recurso === "baldes") itens = (await chamar<{ baldes: Nomeado[] }>("GET", "/baldes")).baldes;
    else itens = await chamar<Nomeado[]>("GET", `/${recurso}`);
    cache.set(recurso, itens);
    return itens;
  }

  async function resolver(recurso: "contas" | "cartoes" | "projetos" | "baldes", ref: string): Promise<Nomeado> {
    const itens = await listar(recurso);
    const porId = itens.find((i) => i.id === ref);
    if (porId) return porId;
    const alvo = ref.toLowerCase();
    const exato = itens.filter((i) => i.nome.toLowerCase() === alvo);
    if (exato.length === 1) return exato[0]!;
    const parcial = itens.filter((i) => i.nome.toLowerCase().includes(alvo));
    if (parcial.length === 1) return parcial[0]!;
    throw new Error(
      parcial.length > 1
        ? `"${ref}" e ambiguo em ${recurso}: ${parcial.map((i) => i.nome).join(", ")}`
        : `"${ref}" nao encontrado em ${recurso}. Disponiveis: ${itens.map((i) => i.nome).join(", ") || "(vazio)"}`,
    );
  }

  server.tool("listar_cadastros", "Lista contas, cartoes, baldes e projetos (ids e nomes)", {}, async () => {
    const [contas, cartoes, baldes, projetos] = await Promise.all([
      listar("contas"), listar("cartoes"), listar("baldes"), listar("projetos"),
    ]);
    return texto({ contas, cartoes, baldes, projetos });
  });

  server.tool(
    "resumo",
    "Resumo financeiro: saldos, cartoes (limite/proxima fatura), baldes previsto vs realizado, provisionamento do mes. mes=YYYY-MM opcional",
    { mes: z.string().regex(/^\d{4}-\d{2}$/).optional() },
    async ({ mes }) => texto(await chamar("GET", `/resumo${mes ? `?mes=${mes}` : ""}`)),
  );

  server.tool(
    "extrato_dfc",
    "Extrato & projecoes (DFC) de um mes: caixa realizado + projecoes, saldo acumulado e projetado",
    { mes: z.string().regex(/^\d{4}-\d{2}$/).optional(), incluirProjecoes: z.boolean().default(true) },
    async ({ mes, incluirProjecoes }) =>
      texto(await chamar("GET", `/dfc?${mes ? `mes=${mes}&` : ""}projecoes=${incluirProjecoes}`)),
  );

  server.tool(
    "listar_transacoes",
    "Ultimas transacoes (ate 200), incluindo pendentes de confirmacao",
    { apenasPendentes: z.boolean().default(false) },
    async ({ apenasPendentes }) => {
      const linhas = await chamar<Array<{ pendente: boolean }>>("GET", "/transacoes");
      return texto(apenasPendentes ? linhas.filter((l) => l.pendente) : linhas);
    },
  );

  const lancamentoShape = {
    descricao: z.string().min(1),
    valor: z.number().positive(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tipo: z.enum(["entrada", "saida"]).default("saida"),
    conta: z.string().optional().describe("Nome ou id da conta (origem em conta)"),
    cartao: z.string().optional().describe("Nome ou id do cartao (origem no cartao)"),
    parcelas: z.number().int().min(1).max(24).default(1).describe("So para cartao"),
    forma: z.enum(["pix", "debito", "transferencia", "boleto", "dinheiro"]).default("pix").describe("So para conta"),
    balde: z.string().optional().describe("Nome ou id do balde de destino"),
    projeto: z.string().optional().describe("Nome ou id do projeto (exclusivo com balde)"),
  };

  async function montarLancamento(
    l: {
      descricao: string; valor: number; data: string; tipo: "entrada" | "saida";
      conta?: string; cartao?: string; parcelas: number; forma: string; balde?: string; projeto?: string;
    },
    pendente: boolean,
  ) {
    if (!l.conta && !l.cartao) throw new Error(`"${l.descricao}": informe conta OU cartao`);
    if (l.balde && l.projeto) throw new Error(`"${l.descricao}": balde e projeto sao excludentes`);
    const baldeId = l.balde ? (await resolver("baldes", l.balde)).id : undefined;
    const projetoId = l.projeto ? (await resolver("projetos", l.projeto)).id : undefined;
    const base = { descricao: l.descricao, valor: l.valor, data: l.data, baldeId, projetoId, pendente };
    if (l.cartao) {
      return { origem: "cartao", tipo: "saida", cartaoId: (await resolver("cartoes", l.cartao)).id, parcelas: l.parcelas, ...base };
    }
    return { origem: "conta", tipo: l.tipo, contaId: (await resolver("contas", l.conta!)).id, forma: l.forma, ...base };
  }

  server.tool(
    "criar_lancamento",
    "Cria um lancamento (conta ou cartao, com parcelas). Entra PENDENTE por padrao — confirmado=true so com autorizacao explicita do usuario",
    { ...lancamentoShape, confirmado: z.boolean().default(false) },
    async (args) => {
      const corpo = await montarLancamento(args, !args.confirmado);
      const criadas = await chamar<Array<{ id: string; descricao: string; valor: string; data: string; pendente: boolean }>>(
        "POST", "/transacoes", corpo,
      );
      return texto({ criadas: criadas.map((c) => ({ id: c.id, descricao: c.descricao, valor: c.valor, data: c.data, pendente: c.pendente })) });
    },
  );

  server.tool(
    "lancar_em_lote",
    "Cria varios lancamentos de uma vez (importacao OFX/extrato). Todos entram PENDENTES para revisao",
    { lancamentos: z.array(z.object(lancamentoShape)).min(1).max(200) },
    async ({ lancamentos }) => {
      const resultados: Array<{ descricao: string; ok: boolean; erro?: string; ids?: string[] }> = [];
      for (const l of lancamentos) {
        try {
          const corpo = await montarLancamento(l, true);
          const criadas = await chamar<Array<{ id: string }>>("POST", "/transacoes", corpo);
          resultados.push({ descricao: l.descricao, ok: true, ids: criadas.map((c) => c.id) });
        } catch (e) {
          resultados.push({ descricao: l.descricao, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      const falhas = resultados.filter((r) => !r.ok).length;
      return texto({ total: lancamentos.length, criados: lancamentos.length - falhas, falhas, resultados });
    },
  );

  server.tool(
    "confirmar_lancamentos",
    "Confirma lancamentos pendentes (apos revisao do usuario). Passe os ids",
    { ids: z.array(z.string().uuid()).min(1) },
    async ({ ids }) => {
      const resultados = [];
      for (const id of ids) {
        try {
          await chamar("POST", `/transacoes/${id}/confirmar`);
          resultados.push({ id, ok: true });
        } catch (e) {
          resultados.push({ id, ok: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return texto(resultados);
    },
  );

  server.tool(
    "transferencia",
    "Transferencia entre contas proprias (nao conta como gasto)",
    {
      contaOrigem: z.string(),
      contaDestino: z.string(),
      valor: z.number().positive(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      descricao: z.string().default("Transferencia entre contas"),
    },
    async ({ contaOrigem, contaDestino, valor, data, descricao }) => {
      const origem = await resolver("contas", contaOrigem);
      const destino = await resolver("contas", contaDestino);
      return texto(await chamar("POST", "/transferencias", { contaOrigemId: origem.id, contaDestinoId: destino.id, valor, data, descricao }));
    },
  );

  server.tool(
    "listar_faturas",
    "Faturas de um cartao (ciclos, vencimentos, status); itens de uma fatura via faturaId",
    { cartao: z.string().optional(), faturaId: z.string().uuid().optional() },
    async ({ cartao, faturaId }) => {
      if (faturaId) return texto(await chamar("GET", `/faturas/${faturaId}/itens`));
      const faturas = await chamar<Array<{ cartaoId: string }>>("GET", "/faturas");
      if (!cartao) return texto(faturas);
      const c = await resolver("cartoes", cartao);
      return texto(faturas.filter((f) => f.cartaoId === c.id));
    },
  );

  server.tool(
    "pagar_fatura",
    "Registra pagamento de fatura (modelo boleto: escolha a conta de debito). Requer confirmacao previa do usuario",
    {
      faturaId: z.string().uuid(),
      conta: z.string(),
      valor: z.number().positive(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    async ({ faturaId, conta, valor, data }) => {
      const c = await resolver("contas", conta);
      return texto(await chamar("POST", `/faturas/${faturaId}/pagar`, { contaId: c.id, valor, data }));
    },
  );

  return server;
}
