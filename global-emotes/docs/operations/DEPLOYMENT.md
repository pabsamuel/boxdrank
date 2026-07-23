# DEPLOYMENT

Three environments: local (compose), **staging** (auto-deploy on main), **production** (manual approval). Concrete vendors are the owner's pick (OWNER_ACTIONS); the shapes below work on Fly.io/Railway/Render/ECS equally.

## Topology

- `web`: Vercel (set root `global-emotes/apps/web`) or the API container host.
- `api` + `worker`: containers from `infrastructure/docker/Dockerfile.{api,worker}`.
- Managed PostgreSQL 16 (small instance to start) + managed Redis.
- R2/S3 buckets: `emote-originals` (private), `emote-processed` (CDN-fronted), `uploads-quarantine` (private, 7-day lifecycle purge).
- Cloudflare in front of web+api+CDN (DNS, WAF, rate-limit backstop).

## Steps (staging first, then production identically)

1. Provision DB/Redis/buckets; note URLs.
2. Set env vars from `.env.example` — real values for: `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` (fresh 32+ chars), `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`), S3 creds, `PUBLIC_WEB_URL`/`PUBLIC_API_URL`, email provider, Stripe test keys (staging) / live keys (production), provider credentials as available.
3. Run migrations as a release step: `pnpm db:migrate` (containers include tsx; run the command in a one-off task before switching traffic).
4. Deploy api + worker containers; health-check `GET /v1/health` must return 200 before traffic.
5. Deploy web with `BRAND_NAME`/`PUBLIC_API_URL` set at build time.
6. Register OAuth callbacks per provider docs (`docs/integrations/*`) and the Stripe webhook (`https://api.<domain>/v1/webhooks/stripe`, events: subscriptions, invoices, checkout).
7. Seed products/prices: create Stripe prices with `lookup_key` = `fan_plus|creator_pro|creator_business`, insert matching `prices` rows (SQL in MONETIZATION.md).
8. Smoke: run the QA plan's 10-minute pass (docs/QA_TEST_PLAN.md).

## Rollback

Containers: redeploy previous image tag (stateless). Migrations are additive-only policy — never destructive in the same release as code that needs the old shape; a bad migration rolls forward with a fix migration. Web: previous Vercel deployment promote.

## CD wiring (GitHub Actions)

`ci.yml` gates PRs. Add environment-specific deploy workflows once the vendor is picked (deploy hooks/tokens in repo secrets — never in code). Production deploys require the GitHub environment approval gate.
