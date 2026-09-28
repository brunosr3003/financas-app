const MCP_CMD = `claude mcp add cofre \\
  --env COFRE_API_URL=https://cofre.grupomultiluz.com.br/api \\
  --env COFRE_EMAIL=seu@email.com \\
  --env COFRE_SENHA=sua-senha \\
  -- npx -y tsx apps/mcp/src/index.ts`;

import { useState, type ReactNode } from "react";
import { api } from "../api";

function ConectorClaudeAi() {
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setErro("");
    try {
      const r = await api<{ url: string }>("POST", "/auth/token-mcp");
      setUrl(r.url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar");
    }
  }

  return (
    <div style={{ margin: "8px 0" }}>
      {url ? (
        <>
          <pre className="ajuda-code" style={{ userSelect: "all" }}>{url}</pre>
          <button className="btn mini" style={{ width: "auto" }} onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}>{copiado ? "Copiado ✓" : "Copiar link"}</button>
          <span style={{ fontSize: "11.5px", color: "var(--ink-muted)", marginLeft: 8 }}>
            Guarde com carinho: quem tiver esse link acessa seus dados.
          </span>
        </>
      ) : (
        <button className="btn mini" style={{ width: "auto" }} onClick={gerar}>Gerar link de conexão</button>
      )}
      {erro && <div className="msg error">{erro}</div>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="ajuda-sec">
      <summary>{titulo}</summary>
      <div className="ajuda-corpo">{children}</div>
    </details>
  );
}

export function Ajuda() {
  return (
    <section>
      <h2 className="section">Como o sistema funciona</h2>

      <Secao titulo="⚡ O básico em 1 minuto">
        <p>O Cofre controla seu dinheiro em cinco visões: <strong>Resumo</strong> (saldos, cartões, baldes), <strong>Cartões</strong> (faturas e parcelas), <strong>Projetos</strong> (gastos com budget próprio), <strong>Extrato</strong> (fluxo de caixa diário com projeções) e <strong>Provisões</strong> (contas recorrentes e financiamentos).</p>
        <p>Primeiros passos: abra <strong>Cadastros</strong> (☰ no topo) e crie suas <strong>contas</strong> (com saldo atual) e <strong>cartões</strong>. Ajuste sua <strong>renda-base</strong> em "Baldes &amp; renda". Depois é só usar o botão <strong>Lançar</strong> pra registrar cada gasto ou entrada.</p>
      </Secao>

      <Secao titulo="🧠 Competência vs caixa — a alma do sistema">
        <p><strong>O quê:</strong> uma compra no cartão conta no seu orçamento (balde ou projeto) <em>no dia da compra</em>, mas só sai do seu dinheiro <em>no dia que você paga a fatura</em>.</p>
        <p><strong>Por quê:</strong> assim o orçamento mostra o que você realmente gastou no mês, e o caixa mostra o que realmente saiu da conta — sem contar o mesmo gasto duas vezes e sem "sumir" dinheiro.</p>
        <p><strong>Como:</strong> lance compras de cartão normalmente; elas entram na fatura e na "provisão de pagamento". Quando pagar a fatura (tela Cartões → Pagar), a saída aparece no Extrato — e não afeta os baldes, porque o gasto já contou na compra.</p>
      </Secao>

      <Secao titulo="🪣 Baldes — orçamento por percentual">
        <p>Cada balde recebe um <strong>percentual da sua renda-base</strong> (ex.: Necessidades 50%, Lazer 7%). A meta mensal é calculada sozinha, e a soma dos percentuais deve fechar 100%.</p>
        <p>Todo gasto lançado com um balde consome a meta daquele mês. O Resumo mostra a barra de cada balde: quanto era previsto, quanto foi, quanto sobra — e avisa quando estourou.</p>
        <p>Edite percentuais e renda em Cadastros → Baldes &amp; renda. A descrição de cada balde aparece no ícone ⓘ.</p>
      </Secao>

      <Secao titulo="💳 Cartões e faturas — modelo boleto">
        <p>Cartão não tem conta de pagamento fixa: a fatura é tratada como um <strong>boleto</strong> — você escolhe de qual conta pagar na hora, inclusive pagamento parcial.</p>
        <p>A tela Cartões mostra: limite usado (alerta em 70% e 90%), <strong>melhor dia de compra</strong> (dia seguinte ao fechamento — mais prazo pra pagar), histórico completo de faturas com busca, parcelas futuras por mês e parcelamentos ativos.</p>
        <p>Compra parcelada gera uma parcela em cada fatura seguinte. Dá pra lançar retroativo em fatura antiga (no Lançar, escolha a "fatura de destino") — fatura paga que recebe ajuste fica marcada como "ajustada".</p>
      </Secao>

      <Secao titulo="📁 Projetos — gastos fora do orçamento">
        <p>Projetos (casamento, reforma, viagem grande) têm <strong>budget total próprio</strong> e ficam <strong>fora dos baldes</strong> — não estouram seu orçamento mensal.</p>
        <p>Divida em <strong>etapas</strong> com budget cada, e monte o <strong>fluxo de pagamento</strong>: pagamentos agendados entram nas projeções do Extrato; o botão <strong>Pagar</strong> gera a saída de caixa e consolida o realizado na hora.</p>
        <p>O interruptor no card do projeto desliga todas as projeções dele de uma vez — útil pra simular "e se eu adiar isso?".</p>
      </Secao>

      <Secao titulo="🔮 Provisões e projeções">
        <p>Provisões são o que <em>vai</em> acontecer: salário, condomínio, IPTU, financiamento. Cada uma tem um interruptor individual — desligou, o saldo projetado recalcula na hora.</p>
        <p><strong>Não mensais</strong> (IPTU, seguros, anuidades) mostram a "reserva mensal equivalente" (valor ÷ meses) pra você se programar. <strong>Serviços com valor variável</strong> (ex.: energia) usam o último valor como projeção.</p>
        <p><strong>Financiamentos</strong> (SAC ou PRICE): o sistema calcula sozinho as parcelas, juros e o cronograma completo — botão "Projetar parcelas". Vencimento em fim de semana ou feriado? A projeção já adia pro próximo dia útil.</p>
        <p>Os interruptores de ligar/desligar ficam no <strong>Extrato → Escolher projeções</strong>; a aba Provisões é o painel de consulta e cadastro.</p>
      </Secao>

      <Secao titulo="📈 Extrato & Projeções (DFC)">
        <p>É o seu extrato bancário consolidado, navegável por mês: movimentos realizados + projeções futuras, com saldo acumulado linha a linha e <strong>saldo projetado do fim do mês</strong>.</p>
        <p>Filtre por conta (pode combinar várias), escolha um período livre cruzando meses, e use o divisor "▾ projeções" pra ver onde termina o realizado. Saldo negativo em qualquer dia aparece em vermelho — é o alerta pra agir antes.</p>
        <p>Compras de cartão <em>não</em> aparecem aqui (não são caixa); o pagamento da fatura aparece, na data de vencimento.</p>
      </Secao>

      <Secao titulo="🏦 Reservas & investimentos">
        <p>Reserva é o <strong>objetivo</strong> (emergência, aposentadoria) com uma meta em R$. Dentro dela ficam as <strong>aplicações</strong> (banco/corretora + produto + valor), e você lança rendimentos (+) e taxas (−) pelo botão ± em Cadastros → Reservas.</p>
        <p>Reservas ficam fora do caixa e do Extrato — o aporte do balde "Construção de reserva" é a saída que as alimenta.</p>
      </Secao>

      <Secao titulo="✨ Conectar ao claude.ai (recomendado)">
        <p><strong>O que é:</strong> conecte o Cofre direto ao <strong>claude.ai</strong> — o chat do Claude no navegador ou no app do celular, usando a <em>sua</em> conta do Claude. Depois de conectado, é só conversar: "lança 50 reais de mercado", "como estão meus baldes?", "sobe esse extrato OFX".</p>
        <p><strong>Segurança:</strong> lançamentos criados pelo Claude entram como <strong>pendentes</strong> até você confirmar. O link de conexão é pessoal — dá pra revogar gerando um novo.</p>
        <p><strong>Passo 1</strong> — gere seu link de conexão:</p>
        <ConectorClaudeAi />
        <p><strong>Passo 2</strong> — no claude.ai: <em>Configurações → Conectores → Adicionar conector personalizado</em>, cole o link e salve. (Precisa de plano Claude Pro ou Max.)</p>
        <p><strong>Passo 3</strong> — numa conversa nova, ative o conector "cofre-financas" no menu de ferramentas e converse normalmente.</p>
      </Secao>

      <Secao titulo="🤖 Conectar o Claude Code (terminal/MCP)">
        <p><strong>O que é:</strong> o Cofre tem um conector MCP que liga o app ao <strong>Claude Code</strong> (o assistente da Anthropic no terminal). Com ele, o Claude lança gastos por você, importa extratos OFX inteiros, consulta saldos e paga faturas — tudo conversando em português.</p>
        <p><strong>Segurança:</strong> lançamentos criados pelo Claude entram como <strong>pendentes</strong> — você revisa e confirma antes de valer. Nada é confirmado sem você.</p>
        <p><strong>Como conectar</strong> (precisa do Claude Code instalado e do conector, que acompanha o app):</p>
        <pre className="ajuda-code">{MCP_CMD}</pre>
        <p>Troque email e senha pelos do seu login. Depois é só conversar:</p>
        <ul>
          <li>"lança 89,90 de mercado ontem no balde Necessidades, conta Itaú"</li>
          <li>"sobe esse OFX e classifica os lançamentos nos baldes" (anexando o arquivo)</li>
          <li>"como estão meus baldes esse mês?"</li>
          <li>"paga a fatura do Nubank com a conta Itaú"</li>
          <li>"confirma os lançamentos pendentes"</li>
        </ul>
        <p>Ferramentas disponíveis: resumo, extrato, listar/criar lançamentos (com parcelas), lote OFX, confirmação de pendentes, transferências, faturas e pagamento de fatura.</p>
      </Secao>

      <Secao titulo="👤 Conta, assinatura e membros">
        <p>Conta nova nasce <strong>aguardando ativação</strong> — o acesso libera quando a assinatura é confirmada. Depois de ativo, é só recarregar.</p>
        <p>Em Cadastros → Membros, o proprietário pode adicionar outras pessoas ao mesmo espaço (papéis: proprietário ou membro).</p>
        <p>Contas com histórico não são apagadas — são <strong>arquivadas</strong>, preservando o extrato.</p>
      </Secao>

      <Secao titulo="📤 Seus dados são seus (LGPD)">
        <p>Exporte todas as transações em CSV: <code>/api/export/transacoes.csv</code> (logado). Descrições de lançamentos são criptografadas no banco (AES-256), senhas nunca são armazenadas em texto, e as ações da conta ficam em trilha de auditoria.</p>
      </Secao>
    </section>
  );
}
