# Terraform (skeleton)

The chosen production path (ADR-0001) is deliberately portable: Cloudflare
(DNS/CDN/WAF) + managed PostgreSQL/Redis + S3-compatible bucket (R2) + a
container host (Fly.io/Railway/ECS) for api/worker + Vercel-or-container for
web. Deployment is fully documented and executable by hand in
`docs/operations/DEPLOYMENT.md`; codify it here when the owner picks concrete
vendors (OWNER_ACTIONS).

Planned modules: `dns/` (Cloudflare records + WAF rules) · `data/` (Postgres,
Redis, R2 bucket + lifecycle rules) · `apps/` (containers, secrets, health
checks) · `observability/` (Sentry project, uptime checks, budget alerts).

Rule: no real credentials in this tree, ever. State backend must be remote and
encrypted before the first `terraform apply`.
