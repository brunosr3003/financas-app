# Finanças App

App de controle financeiro (spec do Gabriel Ferreira, v1.0 — `docs/` futuramente) com
multiusuário por empresa (proprietário/membro), API Fastify + Drizzle + Postgres RLS,
front React (a portar do protótipo) e conector MCP para lançamentos via Claude Code.

## Stack

- **Monorepo** pnpm workspaces: `apps/api`, `apps/web` (pendente), `apps/mcp` (pendente), `packages/shared` (schemas Zod).
- **Multi-tenant**: toda tabela de dados carrega `empresa_id` + policy de RLS (`app.empresa_id` via `set_config`). Duas conexões: `db` (role `financas_app`, RLS ligada) e `adminDb` (superuser, só seed/jobs).
- **Auth**: JWT (`@fastify/jwt`) com `{ sub, empresaId, papel, email }`; papéis `proprietario` | `membro`.

## Rodar

```sh
pnpm install
pnpm db:up            # postgres:16 no docker (porta 5434) — precisa do colima/docker rodando
pnpm db:setup         # push do schema + RLS + seed (dev@financas.local / financas123)
pnpm dev:api          # API em :3400
```

Após alterar `src/db/schema.ts`: `pnpm --filter @financas/api db:push && pnpm --filter @financas/api db:rls`
(policies de tabelas novas só existem depois de re-rodar o `db:rls`).

## Segurança / LGPD

- **Criptografia de campo** (AES-256-GCM, chave `DATA_KEY` no .env): `transacao.descricao`, `pagamento_projeto.descricao`, `parcelamento.descricao` cifradas em repouso (prefixo `enc:`); busca de texto decifra e filtra na aplicação.
- **Trilha de auditoria** (`audit_log`): login/registro, lançamentos, pagamentos de fatura/projeto, toggles de projeto — com usuário, IP e timestamp.
- **Rate limit**: 300 req/min global, 10 req/min em `/auth/*`.
- **Registro fechado**: `CODIGO_REGISTRO` no .env exige código no `POST /auth/register` (vazio = aberto, só dev).
- **Exportação CSV** (`GET /export/transacoes.csv`): portabilidade (LGPD art. 18) + requisito da spec.
- Senhas com scrypt; RLS por empresa em todas as tabelas de dados; papéis proprietário/membro por empresa.

## Regras de negócio implementadas

- RN-01/02: baldes previsto vs realizado por competência, períodos multi-mês (RN-12) — `GET /resumo`.
- RN-03/05: compra no cartão cai na fatura do ciclo (criada sob demanda; fatura paga rola pro ciclo seguinte); parcelada gera N transações nas faturas seguintes, centavos na 1ª parcela.
- RN-04: pagamento de fatura modelo boleto (conta na hora, parcial suportado); fatura futura projeta sem conta (só visão consolidada).
- RN-06/07: limite utilizado com alertas 70/90%, melhor dia de compra.
- RN-08/09: projeções com toggles individuais, master switch de projeto, toggle de fatura (`POST /faturas/:id/projecao`), switch mestre no DFC.
- RN-10/11: `GET /dfc` — extrato cronológico por mês/período livre, multisseleção de contas, saldo projetado; provisionamento do mês no Resumo.
- RN-13: projetos com etapas, fluxo de pagamento, realizado/comprometido/livre, botão Pagar.
- RN-14/15: transferências; retroativo com fatura `ajustada`, itens de fatura + busca (`GET /cartoes/:id/busca?q=`).
- RN-16/17/18: não mensais com reserva mensal equivalente; vencimentos adiados pro próximo dia útil (feriados nacionais + Páscoa calculada); serviços valor fixo/variável.
- RN-19: reservas com meta/progresso, aplicações e movimentos de rendimento/custo.
- RN-20: crédito SAC/PRICE com cronograma completo (`GET /creditos/:id/cronograma`).
- Lançamentos via MCP/importação entram com `pendente: true`; confirmação em `POST /transacoes/:id/confirmar`.

**Testes**: `npx tsx src/scripts/aceite.ts` roda os 6 critérios de aceite da spec contra a API local (todos passando).

## Produção

`https://cofre.grupomultiluz.com.br` (VPS multiluz9, aaPanel): pm2 `cofre-api` :3401, docker `cofre-db` :5437, nginx `/api/` → API, `/app/` bloqueado, SSL Let's Encrypt. Redeploy: rsync + `pnpm db:push && pnpm db:rls` + `pm2 restart cofre-api`.

## Pendente (próximas sessões)

- `apps/web` (portar protótipo `prototipo-financas_5.html`).
- `apps/mcp` (conector Claude Code: lançamentos, OFX, consultas).
- Fechamento automático de fatura por job (hoje o status efetivo é derivado por data), alertas de "conferir valor" (RN-18) como notificação, exclusão/arquivamento com regras da seção 4.7.
