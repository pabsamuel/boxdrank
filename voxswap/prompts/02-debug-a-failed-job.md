# Debug a failed job

Use when a run stopped and you want to know why and what to do.

---

A job failed. Diagnose it and fix it.

Order ID: `<ORDER ID>`

What I saw:

```
<PASTE THE FULL ERROR, EXACTLY AS IT APPEARED>
```

Please:

1. Run `python3 -m voxswap status <ORDER ID>` and read `work/<ORDER ID>/job.log`.
2. Tell me in one or two plain sentences what actually went wrong — not a
   restatement of the error.
3. Say whether this is **my** problem (paperwork, patterns, a missing file, a
   key), a **provider** problem, or a **bug in the code**.
4. If it is mine: tell me exactly what to change, then the exact command to
   resume with (`run --from <stage>` — pick the earliest stage that actually
   needs redoing, so I do not re-pay for work that already succeeded).
5. If it is a bug: fix it, add a test that fails without the fix, and run
   `python3 -m unittest discover -s tests -t .`.

Check `docs/08-TROUBLESHOOTING.md` first — if this case is already documented,
say so and follow it rather than improvising.

Do not weaken the consent gate to get past a consent error, and do not lower
`qc_min_pass_rate` to get past a quality gate without telling me plainly that
that is what you are proposing and why.

---
