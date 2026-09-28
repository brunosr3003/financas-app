/**
 * Criterios de aceite da spec (secao 6) contra a API rodando em localhost.
 * Uso: tsx src/scripts/aceite.ts [porta]
 */
const BASE = `http://localhost:${process.argv[2] ?? process.env.PORT ?? 3400}`;
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

let token = "";
let falhas = 0;

async function api(metodo: string, rota: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${rota}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${metodo} ${rota} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function aprox(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function checar(nome: string, cond: boolean, detalhe = "") {
  if (cond) console.log(`  ✓ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ✗ ${nome} ${detalhe}`);
  }
}

// --- setup: empresa nova ----------------------------------------------------
const sufixo = `${Date.now()}`;
const reg = await api("POST", "/auth/register", {
  nome: "Aceite",
  email: `aceite-${sufixo}@teste.local`,
  senha: "senha-aceite-123",
  empresaNome: `Aceite ${sufixo}`,
});
token = reg.token;

await api("PATCH", "/config", { rendaBase: 16285.6 });
const conta = await api("POST", "/contas", {
  nome: "Conta Teste",
  banco: "Banco Teste",
  saldoInicial: 50000,
  dataSaldoInicial: `${hoje.slice(0, 7)}-01`,
});
const cartao = await api("POST", "/cartoes", { nome: "Cartao Teste", limite: 30000, diaFechamento: 28, diaVencimento: 7 });
const { baldes } = await api("GET", "/baldes");
const baldeLazer = baldes.find((b: { nome: string }) => b.nome === "Lazer");

console.log("\nCA-1: compra de R$ 1.000 no cartao");
{
  const antes = await api("GET", `/dfc?projecoes=false`);
  await api("POST", "/transacoes", {
    origem: "cartao",
    tipo: "saida",
    cartaoId: cartao.id,
    descricao: "Compra teste",
    valor: 1000,
    data: hoje,
    parcelas: 1,
    baldeId: baldeLazer.id,
  });
  const resumo = await api("GET", "/resumo");
  const c = resumo.cartoes[0];
  checar("fatura/provisao do cartao +1000", aprox(c.utilizado, 1000), `(utilizado=${c.utilizado})`);
  checar("balde Lazer +1000", aprox(resumo.baldes.find((b: { id: string }) => b.id === baldeLazer.id).realizado, 1000));
  const depois = await api("GET", `/dfc?projecoes=false`);
  checar("caixa/DFC inalterado", aprox(antes.saldoFinalAtual, depois.saldoFinalAtual));
}

console.log("\nCA-2: pagamento de fatura de R$ 6.230,10");
{
  await api("POST", "/transacoes", {
    origem: "cartao",
    tipo: "saida",
    cartaoId: cartao.id,
    descricao: "Compra grande",
    valor: 5230.1,
    data: hoje,
    parcelas: 1,
    baldeId: baldeLazer.id,
  });
  const faturas = await api("GET", "/faturas");
  const fat = faturas[0];
  const resumoAntes = await api("GET", "/resumo");
  const baldesAntes = JSON.stringify(resumoAntes.baldes);
  await api("POST", `/faturas/${fat.id}/pagar`, { contaId: conta.id, valor: 6230.1, data: hoje });
  const resumoDepois = await api("GET", "/resumo");
  checar("saida de caixa na conta", aprox(resumoDepois.contas[0].saldo, 50000 - 6230.1), `(saldo=${resumoDepois.contas[0].saldo})`);
  checar("provisao do cartao zerada", aprox(resumoDepois.cartoes[0].utilizado, 0), `(utilizado=${resumoDepois.cartoes[0].utilizado})`);
  checar("baldes inalterados", JSON.stringify(resumoDepois.baldes) === baldesAntes);
}

console.log("\nCA-3: desligar projeto com R$ 7.500 em provisoes");
{
  const dia25 = `${hoje.slice(0, 7)}-25`;
  const futuro = dia25 > hoje ? dia25 : null;
  if (!futuro) {
    console.log("  (pulado: dia 25 ja passou neste mes — cenario depende de data futura no mes corrente)");
  } else {
    const proj = await api("POST", "/projetos", { nome: "Projeto Aceite", budgetTotal: 20000 });
    await api("POST", `/projetos/${proj.id}/pagamentos`, {
      descricao: "Sinal",
      valor: 7500,
      dataPrevista: futuro,
      contaId: conta.id,
    });
    const antes = await api("GET", "/dfc");
    await api("PATCH", `/projetos/${proj.id}`, { ativo: false });
    const depois = await api("GET", "/dfc");
    checar(
      "saldo projetado sobe exatamente 7500",
      aprox(depois.saldoFinalProjetado - antes.saldoFinalProjetado, 7500),
      `(diferenca=${depois.saldoFinalProjetado - antes.saldoFinalProjetado})`,
    );
    checar("linhas somem do DFC", !depois.linhas.some((l: { historico: string }) => l.historico.includes("Sinal")));
    await api("PATCH", `/projetos/${proj.id}`, { ativo: true });
  }
}

console.log("\nCA-4: compra parcelada em 10x de R$ 850");
{
  // cartao proprio: fatura paga no CA-2 rolaria a 1a parcela para o ciclo seguinte
  const cartao4 = await api("POST", "/cartoes", { nome: "Cartao CA4", limite: 30000, diaFechamento: 28, diaVencimento: 7 });
  const criadas = await api("POST", "/transacoes", {
    origem: "cartao",
    tipo: "saida",
    cartaoId: cartao4.id,
    descricao: "Parcelado aceite",
    valor: 8500,
    data: hoje,
    parcelas: 10,
    baldeId: baldeLazer.id,
  });
  checar("10 parcelas geradas", criadas.length === 10);
  const faturasIds = new Set(criadas.map((c: { faturaId: string }) => c.faturaId));
  checar("em 10 faturas distintas", faturasIds.size === 10);
  checar("parcelas de 850", criadas.every((c: { valor: string }) => aprox(Number(c.valor), 850)));
  const resumo = await api("GET", "/resumo");
  const c4 = resumo.cartoes.find((c: { id: string }) => c.id === cartao4.id);
  checar("limite inclui as 10 parcelas", aprox(c4.utilizado, 8500), `(utilizado=${c4.utilizado})`);
}

console.log("\nCA-5: periodo de 3 meses multiplica metas");
{
  const [ano, mes] = hoje.split("-").map(Number);
  const iniAno = mes! <= 2 ? ano! - 1 : ano!;
  const iniMes = ((mes! - 3 + 12) % 12) + 1;
  const inicio = `${iniAno}-${String(iniMes).padStart(2, "0")}-01`;
  const resumo = await api("GET", `/resumo?inicio=${inicio}&fim=${hoje}`);
  const lazer = resumo.baldes.find((b: { id: string }) => b.id === baldeLazer.id);
  checar("meta do balde x3", aprox(lazer.meta, 16285.6 * 0.07 * 3), `(meta=${lazer.meta})`);
}

console.log("\nCA-6: marcar pagamento agendado de R$ 5.000 como pago");
{
  const proj = await api("POST", "/projetos", { nome: "Projeto Pagar", budgetTotal: 10000 });
  const amanha = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const mesmoMes = amanha.slice(0, 7) === hoje.slice(0, 7);
  await api("POST", `/projetos/${proj.id}/pagamentos`, {
    descricao: "Fornecedor",
    valor: 5000,
    dataPrevista: amanha,
    contaId: conta.id,
  });
  const antes = await api("GET", "/dfc");
  const saldoContaAntes = (await api("GET", "/resumo")).contas[0].saldo;
  const det = await api("GET", `/projetos/${proj.id}`);
  const pg = det.pagamentos[0];
  await api("POST", `/pagamentos/${pg.id}/pagar`, { data: hoje });
  const depois = await api("GET", "/dfc");
  const detDepois = await api("GET", `/projetos/${proj.id}`);
  const saldoContaDepois = (await api("GET", "/resumo")).contas[0].saldo;
  checar("saldo em contas -5000", aprox(saldoContaAntes - saldoContaDepois, 5000));
  checar("realizado do projeto +5000", aprox(detDepois.realizado, 5000));
  checar("comprometido -5000", aprox(detDepois.comprometido, 0));
  if (mesmoMes)
    checar(
      "saldo projetado do fim do mes inalterado",
      aprox(antes.saldoFinalProjetado, depois.saldoFinalProjetado),
      `(antes=${antes.saldoFinalProjetado} depois=${depois.saldoFinalProjetado})`,
    );
  else console.log("  (saldo projetado: pulado — amanha cai fora do mes corrente)");
}

console.log(falhas === 0 ? "\nTODOS OS CRITERIOS PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
