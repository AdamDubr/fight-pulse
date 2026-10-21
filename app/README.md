# PIT RATING · app.pitrating.com

Единый вход для клуба: **PIT CRM** + **Зал (Arena)**, роли владелец / администратор / тренер.

- `src/worker.js` — Cloudflare Worker: проверка входа Cloudflare Access (код на e-mail), роли, API базы (`/api/sync`, `/api/write`), файлы R2 (`/api/upload`, `/_blob/<id>`), доступ (`/api/users`).
- `public/` — портал (`/`), CRM (`/crm/`), демо зала (`/arena/`), клиент базы `pit-db.js`.
- `migrations/` — схема D1.

Тренер не видит и не может менять кассу (payments, expenses) и не читает журнал действий — это проверяется на сервере.

Секреты (Cloudflare → Worker → Settings → Variables and Secrets): `OWNER_EMAILS` — e-mail владельца(ев) через запятую.
Локально: `.dev.vars` с `DEV=1`, `DEV_EMAIL`, `OWNER_EMAILS`; `npx wrangler d1 migrations apply pit --local`; `npx wrangler dev`.
