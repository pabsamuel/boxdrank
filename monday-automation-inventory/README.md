# Automation Inventory (working name)

A monday.com marketplace app that shows every automation in an account in one
searchable place: on or off, with monday's warnings, older automations
included. The idea is Patrick Fallon's; his words are in `SPEC.md`.

**Status, 28 Sep 2026: not started as an app. 2 / 29 = 7%** (`PROGRESS.md`).
- The inventory logic already exists and is tested, in `seed/`. It was built
  and verified inside Automation Watchdog, then copied here.
- There is no App ID, no name and no deploy yet.

**Next step: Gate 0** (`PROGRESS.md`, items 2–5): competitors, monday's own
automations page, and the run-statistics query. These can stop the project
before anything is built.

## Files

| File | What it holds |
|---|---|
| `MASTER-PROMPT.md` | What Samet pastes into a new project or session to start it |
| `CLAUDE.md` | Operating rules. Read every session |
| `PROGRESS.md` | The checklist and the percentage |
| `DECISIONS.md` | What was decided, by whom, when; what is still open |
| `SPEC.md` | The problem, the MVP, what the API can and cannot do |
| `PLATFORM-FACTS.md` | monday facts learned on Watchdog, with sources |
| `LESSONS.md` | Mistakes from Watchdog not to repeat |
| `REUSE.md` | Which Watchdog files to copy, and how to change them |
| `SUBMISSION-CHECKLIST.md` | Everything monday asks for before approval |
| `BACKLOG.md` | Parked ideas, one line each |
| `seed/` | Tested inventory code carried over from Watchdog |

## Related

- **Automation Watchdog**, `../monday-automation-watchdog/`: app 12249756,
  live, under review since 28 Sep 2026. It sends alerts when an automation
  stops. Do not change it from here.
- **Website**, `../atesensoftware-site/`: `atesensoftware.com`, shared by all
  apps: legal pages, pricing page, domain proof.
- **Research**, `../monday-billable-hours/`: validation notes (`VALIDATION.md`),
  competitors (`COMPETITORS.md`) and the shared backlog.

## Facts to fill in once they exist

| | |
|---|---|
| App name | UNKNOWN (Samet decides) |
| App ID | UNKNOWN |
| Client ID | UNKNOWN |
| Live URL | UNKNOWN |
| Slug on atesensoftware.com | UNKNOWN |
