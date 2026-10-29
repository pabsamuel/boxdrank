# CLAUDE.md: operating rules for Unanswered Updates

Read `README.md` at the start of every session, before doing anything else.

## Reporting

- End every reply with the completion percentage from `PROGRESS.md`.
- Update `PROGRESS.md` whenever an item is finished, and recompute the
  percentage there. Never estimate the percentage in your head.
- Answer Samet in Turkish, bluntly: no hype, no softening a bad result.
  "This is a bad opportunity, stop" is a welcome output.

## Evidence discipline

- Label every claim **FACT** (sourced and dated), **INFERENCE** or
  **ASSUMPTION**. Write **UNKNOWN** rather than guess.
- **Never invent** install counts, review counts, ratings, quotes, prices,
  revenue or customer numbers. If a source is unreachable, say so and say what
  Samet must check himself.
- **Never write monday API, SDK or manifest code from memory.** Sources, in
  order:
  1. The live schema: `https://api.monday.com/v2/get_schema?format=sdl&version=<v>`.
  2. `developer.monday.com`.
  3. The API playground, run by Samet with the answer pasted back.
  If none of these can be reached, stop and ask.
- Date every fact. monday changes monthly. The API version matters: a field
  can exist in `2026-10` and be missing from `2026-07`, the current default.

## Scope

- The scope is `SPEC.md`. Anything else gets one line in `BACKLOG.md`, unless
  Samet asks for it now.
- Do not change `monday-automation-watchdog/` or `monday-automation-inventory/`:
  both are under monday's review. If a change there is needed, tell Samet and
  wait.
- **Gate 0 comes first.** No app code until `GATE0.md` says GO (`DECISIONS.md`).

## Working with Samet

- Keep going without asking. Ask only for decisions that are his: name,
  price, anything legal, signed or paid.
- Steps he must do himself: give the exact click path or command, with full
  Windows paths (`C:\Users\sametatesen2\boxdrank`).
- Browser steps he can delegate: give a ready prompt for ChatGPT or the
  Claude-in-Chrome side panel. Every such prompt says:
  - "Hiçbir gizli değeri (API token, Client Secret, Signing Secret, SMTP
    şifresi) açma, kopyalama, gösterme."
  - "Regenerate'e basma."
  - "Şifre veya 2FA isterse dur, bana sor."
  - "Ödeme yapma."
  - "Formu ben söylemeden gönderme."
- Secrets never enter chat. If one is pasted, tell him to regenerate it at
  once.
- Never suggest `mapps --verbose`: it logs the token.

## Standing constraints

- $100 budget before first revenue.
- No company formation. The legal entity is **Samet Ateşen** (individual
  developer); **Atesen Software** is only the brand.
- A gate is never renegotiated after seeing its result.
