# Deploy

Perde is one Cloudflare Worker: the Vite build as static assets plus the Durable Object relay.
The Workers **Free** plan is enough: rooms are SQLite-backed Durable Objects
(`new_sqlite_classes` in `wrangler.jsonc`), which the free plan allows. A `new_classes` migration
would be refused on Free, so keep it SQLite. Upgrade to Workers Paid ($5/month) only when the
free-plan limits (requests per day, DO duration) start to bind.

## One-time setup

1. **Cloudflare account** → Workers & Pages. The Free plan works; no upgrade needed to start.
2. **API token**: My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template.
   Copy the token and the Account ID (Workers & Pages overview, right column).
3. **GitHub repository secrets** (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Optional **repository variables**:
   - `PERDE_URL` — public URL, used by the post-deploy smoke test (e.g. `https://perde.<account>.workers.dev`)
   - `ENTITLEMENTS_MODE` — `open` (default) or `lemonsqueezy` (see `PRICING.md`)
   - `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRODUCT_ID`, `PERDE_CHECKOUT_URL`
5. Push to `main`. `.github/workflows/perde-deploy.yml` builds and runs `wrangler deploy`.
   The first deploy applies the `v1` Durable Object migration automatically.

The workflow skips itself with a warning until the two secrets exist, so `main` can move before
the account is ready.

## Manual deploy

```bash
pnpm install && pnpm build
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… pnpm deploy
```

or `pnpm --filter @perde/relay exec wrangler login` once and then `pnpm deploy`.

## Custom domain

Workers & Pages → perde → Settings → Domains & Routes → add `perde.app` (or the domain you own,
DNS on Cloudflare). WebSockets and HTTPS work out of the box; nothing else to configure.
Update `PERDE_URL` and the landing copy (`apps/web/src/pages/Landing.tsx` mentions
`perde.app/stage`).

## Checks after deploy

- `GET /api/health` → `{"ok":true,"version":"…","mode":"open|lemonsqueezy"}`
- Open `/stage` on a laptop, `/join?room=CODE&seat=p1` on a phone over mobile data (not the same
  Wi‑Fi): the puppet must move. This proves the relay, not just the LAN.
- iOS: the "Pick up the puppet" tap must show the motion permission sheet (HTTPS only).

## Local development

```bash
pnpm dev:relay    # workerd on :8787, serves apps/web/dist (run pnpm build first)
pnpm dev:web      # vite on :5173 with /api proxied to :8787, hot reload
```

Phones on the same Wi‑Fi can reach the Vite server (`--host`). iOS motion needs HTTPS: either
`wrangler dev --local-protocol https` or a tunnel (`cloudflared tunnel --url http://localhost:5173`).

## Costs at scale

A room is one Durable Object; hibernation means idle rooms cost nothing. A 20-minute show with
two phones at 30 pose messages/s is ~72k messages; at Cloudflare's DO pricing that is well under
a cent. Static assets are free. Budget: the Free plan until the daily request limit binds, then
the $5 plan until thousands of families.

## Rollback

`wrangler rollback` from `apps/relay`, or re-run the deploy workflow on an older commit
(`workflow_dispatch`).
