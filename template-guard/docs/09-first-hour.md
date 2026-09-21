# Your first hour with the monday account

You have the account. This is what to do with it, in order, and what each step
actually answers. Everything here needs a machine that can reach monday.com —
no Claude session in this environment can, so all of it is yours.

Budget: about an hour for steps 1–3. Steps 4–5 are a separate afternoon.

---

## Before you start: what this hour is for

Nothing in this repository has ever talked to monday. Five claims in the code
are marked `✱` — believed from documentation, never observed. One of them can
fail in a way that makes the product **confidently wrong** rather than broken,
which is the only failure mode that really matters here.

This hour turns believed into observed. It is not setup. It is the test.

---

## Step 1 — Get a token (5 minutes)

A personal API token, for the verification script only. The server never uses
one; it gets a per-account token through OAuth.

In monday, it is under your avatar (bottom left) → **Developers** → **My
Access Tokens**. An account admin can also find one under **Administration →
Connections → API**. If neither path matches what you see, search the help
centre for "API token" — monday moves this.

Then, in the repo:

```bash
cd template-guard
npm install
export MONDAY_API_TOKEN='paste-it-here'
```

Do not put it in `.env` and do not commit it. It is a key to your whole
account, and this script is the only thing that needs it.

---

## Step 2 — Find the right board (5 minutes)

```bash
npm run verify:live -- --list-boards
```

It prints every board the token can see, with its id, and marks with **★** the
ones that have a connect column.

**The ★ is the whole point.** The single most dangerous unknown in this codebase
is which key in a column's settings holds the linked board IDs. Guessing it
wrong does not throw an error — it returns "no linked boards" for every column,
which the app renders as *every board is correctly wired*. A board with no
connect column cannot test that, so a run against one reports SKIPPED, and a
SKIPPED check is not a pass.

**If nothing is starred:** make a test board, add a **Connect Boards** column,
point it at any other board. Two minutes. That one column is what the entire
mis-wiring detector reads.

Ideally also add one **automation** to that board, so step 3 can check the
preview schema too.

---

## Step 3 — Run the verification (10 minutes)

The command `--list-boards` printed, plus the board your connect column points
at:

```bash
npm run verify:live -- --board <starred id> --connect-board <the board it points at> --automations
```

Read-only. No mutations, no item reads, nothing printed beyond column titles
and types.

### What the output means

Each claim prints **VERIFIED / FAILED / SKIPPED** with the *observed shape*
next to it — so a failure tells you what to change, not merely that something
is wrong.

| Result | What to do |
|---|---|
| **All VERIFIED** | The `✱` marks come out of the code. Tell me and I will clear them and update `docs/00-api-findings.md`. |
| **`✱2` FAILED** | The most important one. The raw settings are printed underneath it; the real key name is in there. Send me that output and I will fix `BOARD_ID_KEYS` in `src/diff/connect.ts`. |
| **`✱5` FAILED** | Fine, and expected-ish. It means `configuration` is an opaque string, so automation diffing degrades to counting present/absent — which still catches the documented 44→39 case. No code change needed. |
| **`✱0` FAILED** | A field in our query no longer exists in API version 2026-07. The error names it. |
| **Any SKIPPED** | You have verified nothing about that claim. Go back to step 2 and pick a board that can answer it. |

The script exits non-zero if anything failed, so it can gate a release later.

**Send me the whole output either way.** A FAILED result is more useful than a
clean one — it is the thing this hour exists to find.

---

## Step 4 — Deploy to monday code, privately (an afternoon)

Only after step 3. Full commands are in
`docs/06-deployment-and-submission.md`, Part 5. In outline:

```bash
npm install -g @mondaycom/apps-cli
mapps init
# set secrets and env vars (Part 5 lists every one)
npm run deploy:monday:scan     # deploy + security scan
npm run monday:report          # read the scan report
mapps scheduler:create -a <APP_ID> -s "0 */6 * * *" -e "mndy-cronjob/drift" -n "template-guard-drift"
```

Deploy as a **private** app first. You get five of those free.

### Then watch `mapps code:logs` through one sweep

Four behaviours are still unverified and **only a deployment can answer them**
— the verification script tests monday's GraphQL API, not the platform:

1. A large board snapshot against the per-key storage size limit.
2. Whether `search('template:')` returns what the code expects.
3. Secure Storage's 7 requests/second limit during a multi-account sweep.
4. The container's request timeout versus how long a sweep takes.

The sweep is built to survive being cut off — it checkpoints after every
account and resumes (ADR-026) — so (4) should degrade into "it takes two runs"
rather than breaking. That is the design; the logs are the proof.

If any of it bites, the fallback is unchanged and fully supported:
`TEMPLATE_GUARD_PLATFORM=self-hosted`, the Dockerfile, Part 2.

---

## Step 5 — The two gates that are not code

These do not need the account, and they decide whether any of the above was
worth doing.

**Gate #2 — defend the architecture.** `docs/05-architecture-walkthrough.md` is
the answer key: the questions a reviewer asks, with the answers and the honest
limits. Read it until they come without the file. monday rejects apps "built
primarily with AI-generated vibe code", and that policy is really about whether
a person can answer for the code.

**Gate #5 — ten admin conversations.** This is the real one. The marketplace
scan cleared the duplication risk, but the admin/audit category tops out at
951 installs and the nearest neighbour — Workspace Doctor, a polished app with
AI features — did **23 in three months**. Either nobody thought of this, or
people build these and they do not sell. Ten conversations distinguish those
two and nothing else does.

Ask ops people who run one board per client one question: *"When you duplicate
a template board, have you ever found out weeks later that something didn't
come across?"* You are listening for a story, not a yes.

---

## What I need from you, in one line

The output of step 3. Everything else I can do from here.
