# Load tests (k6)

Install [k6](https://k6.io). Target staging, never production. Pass a session cookie captured from a staging login for authenticated scenarios.

```bash
k6 run -e BASE=https://api.staging.example -e COOKIE="ge_session=..." manifest.js
k6 run -e BASE=https://api.staging.example public-pack.js
k6 run -e BASE=https://api.staging.example -e COOKIE="ge_session=..." redeem.js
```

Thresholds encode the SLOs from `docs/operations/OBSERVABILITY.md` (p95 < 300ms reads, error rate < 1%). Redeem intentionally expects 400s (invalid codes) — it verifies the rate limiter engages without 5xx.
