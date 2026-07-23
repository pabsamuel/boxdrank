# LOCAL DEVELOPMENT

Prereqs: Node ≥ 22.12 (`corepack enable` for pnpm 10), Docker.

```bash
./infrastructure/scripts/dev.sh   # or the manual steps below
```

Manual:

```bash
pnpm install
cp .env.example .env      # local defaults work as-is
docker compose up -d      # postgres :5432, redis :6379, minio :9000/:9001, mailpit :8025/:1025
pnpm db:migrate
pnpm db:seed              # demo creator/fan/admin + packs + access code (printed)
pnpm dev                  # turbo: web :3000, api :3001, worker
```

## Demo walkthrough (the whole loop, no external accounts)

1. `/login` → enter `fan@demo.local` → open Mailpit (`:8025`) → click the link.
2. `/library` → redeem code `DEMO-UNLOCK-2026` → Subscriber Pack unlocks.
3. Studio: sign in as `creator@demo.local` → upload a PNG → add to pack → publish → public page at `/demo-creator/subscriber-pack`.
4. Mock membership: `POST /v1/webhooks/providers/mock` with `{"eventId":"e1","fanId":"mock-fan-1","creatorId":"mock-broadcaster-1","tier":"tier1","active":true}` grants via the real engine (link `mock-fan-1` to your user through connect first, role=fan — the mock OAuth accepts code `code:mock-fan-1`).
5. Admin: `admin@demo.local` → `/v1/admin/integrations` shows honest provider statuses.

## Tests

`pnpm verify` = format check + typecheck + all suites (100 tests). DB suites run on embedded PGlite — no Docker needed for tests. Single package: `pnpm --filter @global-emotes/api test`.

## Gotchas

- Ports busy: stop other Postgres/Redis or edit `docker-compose.yml` + `.env`.
- Emails: everything lands in Mailpit locally; nothing leaves your machine.
- Mobile: see `apps/android/README.md`, `apps/ios/README.md` (SDKs required).
