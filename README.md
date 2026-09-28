# Finanças App

Personal/business finance app with
per-company multi-user support (owner/member), a Fastify + Drizzle + Postgres RLS API,
a React front end (being ported from the prototype) and an MCP connector for posting entries via Claude Code.

## Stack

- **Monorepo** with pnpm workspaces: `apps/api`, `apps/web` (pending), `apps/mcp` (pending), `packages/shared` (Zod schemas).
- **Multi-tenant**: every data table carries `empresa_id` + an RLS policy (`app.empresa_id` via `set_config`). Two connections: `db` (role `financas_app`, RLS on) and `adminDb` (superuser, seed/jobs only).
- **Auth**: JWT (`@fastify/jwt`) with `{ sub, empresaId, papel, email }`; roles `proprietario` (owner) | `membro` (member).

## Running

```sh
pnpm install
pnpm db:up            # postgres:16 in docker (port 5434) — needs colima/docker running
pnpm db:setup         # schema push + RLS + seed (dev@financas.local / financas123)
pnpm dev:api          # API on :3400
```

After changing `src/db/schema.ts`: `pnpm --filter @financas/api db:push && pnpm --filter @financas/api db:rls`
(policies for new tables only exist after re-running `db:rls`).

## Security / LGPD

- **Field-level encryption** (AES-256-GCM, `DATA_KEY` in .env): `transacao.descricao`, `pagamento_projeto.descricao`, `parcelamento.descricao` are encrypted at rest (`enc:` prefix); text search decrypts and filters in the application.
- **Audit trail** (`audit_log`): login/registration, entries, invoice/project payments, project toggles — with user, IP and timestamp.
- **Rate limit**: 300 req/min globally, 10 req/min on `/auth/*`.
- **Closed registration**: `CODIGO_REGISTRO` in .env requires a code on `POST /auth/register` (empty = open, dev only).
- **CSV export** (`GET /export/transacoes.csv`): data portability (LGPD art. 18) + spec requirement.
- Passwords hashed with scrypt; per-company RLS on all data tables; owner/member roles per company.

## Implemented business rules

- RN-01/02: planned vs. actual buckets by accrual month, multi-month periods (RN-12) — `GET /resumo`.
- RN-03/05: credit card purchases land on the cycle's invoice (created on demand; a paid invoice rolls over to the next cycle); installment purchases generate N transactions on the following invoices, with leftover cents on the 1st installment.
- RN-04: invoice payment works like a bank slip (account debited immediately, partial payments supported); future invoices are projected without an account (consolidated view only).
- RN-06/07: used credit limit with 70/90% alerts, best purchase day.
- RN-08/09: projections with individual toggles, per-project master switch, invoice toggle (`POST /faturas/:id/projecao`), master switch on the cash flow statement.
- RN-10/11: `GET /dfc` — chronological statement by month/custom period, multi-account selection, projected balance; monthly provisioning in the Summary.
- RN-13: projects with stages, payment flow, spent/committed/available, Pay button.
- RN-14/15: transfers; backdated entries with an `ajustada` (adjusted) invoice, invoice items + search (`GET /cartoes/:id/busca?q=`).
- RN-16/17/18: non-monthly expenses with an equivalent monthly reserve; due dates pushed to the next business day (Brazilian national holidays + computed Easter); fixed/variable-amount services.
- RN-19: savings reserves with goal/progress, investments and yield/cost movements.
- RN-20: loans (SAC/PRICE amortization) with a full schedule (`GET /creditos/:id/cronograma`).
- Entries created via MCP/import come in with `pendente: true`; confirm them with `POST /transacoes/:id/confirmar`.

**Tests**: `npx tsx src/scripts/aceite.ts` runs the spec's 6 acceptance criteria against the local API (all passing).

## Production

`https://cofre.grupomultiluz.com.br` (VPS multiluz9, aaPanel): pm2 `cofre-api` :3401, docker `cofre-db` :5437, nginx `/api/` → API, `/app/` blocked, Let's Encrypt SSL. Redeploy: rsync + `pnpm db:push && pnpm db:rls` + `pm2 restart cofre-api`.

## Pending (next sessions)

- `apps/web` (port the `prototipo-financas_5.html` prototype).
- `apps/mcp` (Claude Code connector: entries, OFX, queries).
- Automatic invoice closing via a job (today the effective status is derived from the date), "check the amount" alerts (RN-18) as notifications, deletion/archiving following the rules in section 4.7.
