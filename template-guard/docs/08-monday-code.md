# monday code — the research, and what it costs us

**Researched:** 20 Sep 2026, from monday's developer documentation and
changelog via indexed search. `developer.monday.com` is still blocked by this
environment's egress policy, so **nothing below was read on the page itself.**
Same evidence class as `docs/00-api-findings.md`: good enough to decide with,
not good enough to build on unverified.

> **Update, same day:** the port was written. Question 1 below — whether an
> app-scoped storage key exists — was answered by installing
> `@mondaycom/apps-sdk@3.3.2` and reading its type definitions:
> `SecureStorage` takes **no token** (app-scoped), `Storage` takes the
> account's token (account-scoped). See **ADR-020**. Four *behavioural*
> questions remain and need a deployment, not a terminal.

**Verdict: it is real, it is the right target, and it is not free.** It
resolves most of what made ADR-010 a genuine dilemma. It also invalidates
`SqliteStorage`, breaks one specific design in the drift scheduler, and
changes how config is read. Roughly a day of work, all of it behind interfaces
that already exist.

---

## ⚠️ One honest note about the evidence, first

One of the search results returned for "monday code Burp scan exemption" was
**our own PR #17**, and the summary quoted our own reasoning back as though it
were a finding. That is search contamination, and laundering it into this
document as external confirmation is exactly the failure this project is built
to refuse. It is excluded. Nothing below rests on it.

---

## What monday code is

A platform for hosting app backends on monday's own infrastructure, rather
than on a server you rent. Launched as beta; the scheduler reached general
availability. Not a toy — it is what Workspace Doctor's *"never on third-party
servers"* claim rests on.

| | |
|---|---|
| **Runtimes** | Node.js and Python have official SDKs |
| **Deploy** | `mapps code:push` via the `@mondaycom/apps-cli` package |
| **Regions** | `us` \| `eu` \| `au` \| `il`, chosen at push time; data residency follows the account's region |
| **Storage** | Key-value Storage API, Secure Storage, a document DB, object (BLOB) storage, a pub/sub queue |
| **Scheduling** | A cron job scheduler |
| **Config** | `mapps code:env` and `mapps code:secret`, read through the SDK |
| **Ops** | `mapps code:logs` streams logs; monitoring and alerting included |
| **Security** | GDPR, HIPAA, ISO 27001, SOC 2. `mapps code:push -s` runs a security scan; `mapps code:report` fetches the report |
| **Networking** | Static outbound IPs, plus an outbound allowlist that can block everything not named |
| **Price** | Free today, "may be subject to payment in the future". Unlimited marketplace apps; up to 5 private apps |

### The storage model, precisely

Key-value, where the key is a string and the value is anything serialisable.
Two flavours: ordinary Storage and **Secure Storage** for sensitive customer
data, compartmentalised per app.

The part that matters for our design: **data is segregated by `accountId` and
app.** One account's data is unreachable from another's. That is a security
property we would otherwise have to build — and, as below, it is also the
thing that breaks our sweep.

Known limits: per-key size limits are enforced; there is no overall storage
cap. Secure Storage was **reduced from 30 requests per second to 7** in a
breaking change dated February 2026. Seven per second is not a lot when a
sweep is reading a snapshot per board.

### The scheduler, precisely

- Create a **POST** route whose path is prefixed `/mndy-cronjob`. That is what
  the scheduler invokes.
- Register it with `mapps scheduler:create -a APP_ID -s "0 * * * *" -e "my-endpoint" -n "name"`.
- **Maximum five scheduled jobs per region.**
- Region-specific — you name the region when creating the job.
- The `il` region does not support cron at all.

Our design needs exactly one job, so the limit of five is comfortable.

### Config, precisely

Environment variables and secrets are **not read through `process.env`**. They
are set with `mapps code:env` / `mapps code:secret` and read through
`EnvironmentVariablesManager` and `SecretsManager` from `@mondaycom/apps-sdk`.
Environment variable changes require a redeploy to take effect.

---

## What it does to ADR-010

The dilemma was: read-only and client-side means an easy security review but no
scheduled monitoring and therefore weak retention; our own server means
monitoring works but we own stored credentials and a host to defend. #17 called
that tension *"unresolved and the most likely way this idea fails."*

monday code takes most of it off the table:

| Objection | Under our own host | On monday code |
|---|---|---|
| "You store our access tokens" | True; encrypted by us, on a box we rent | In Secure Storage, on monday's infrastructure, segregated per account and app |
| "Third-party server" | Unavoidable | **Gone** — this is the claim Workspace Doctor makes in its listing |
| Compliance posture | Ours to assert | GDPR / HIPAA / ISO 27001 / SOC 2, inherited |
| Data residency | Wherever we deploy | Matches the customer's account region automatically |
| Scheduled drift monitoring | Needs our daemon | Native scheduler |
| Ops burden | Ours | Logs, monitoring, alerting included |

### But the Burp scan does **not** disappear

Worth stating plainly, because it is the thing it would be most convenient to
get wrong. monday's marketplace requirements say **all domains must pass the
provided Burp scan**, and apps must supply evidence of how they store secrets
and tokens, with tokens encrypted. I found **no documented exemption** for
apps hosted on monday code.

What genuinely changes is the *surface*: the domain being scanned is monday's
infrastructure rather than a box we configured, `mapps code:push -s` runs a
scan as part of deployment, and `mapps code:report` produces a report. Gate #3
gets smaller and better-supported. It does not vanish, and `STATUS.md` will not
say that it does.

---

## What it costs us — four concrete changes

None of these touch the diff engine. It is pure, has no network dependency,
and does not care where it runs. That was the point of building it that way.

### 1. `SqliteStorage` is dead on monday code ⚠️ **the real cost**

A container with no documented persistent disk cannot hold a SQLite file, and
the platform's own answer to persistence is key-value storage. So there would
be a third `Storage` implementation — `MondayCodeStorage` — over the Storage
and Secure Storage APIs.

That is one file, because `Storage` is an interface and
`test/storage.test.ts` already runs the same suite against every
implementation. Install tokens go to Secure Storage; snapshots and plans to
ordinary Storage. `TokenCipher` becomes defence in depth rather than the only
protection, and stays, because it is cheap and a second lock costs nothing.

### 2. The scheduler's account sweep does not work as designed 🔴 **the real finding**

This is the one that is not a port but a redesign, and it is worth being exact
about.

`DriftScheduler.sweep()` calls `storage.listAccountIdsWithTemplates()` — it
enumerates every account, then works through them. **monday code's storage is
segregated by account.** There is no documented cross-account scan, and the
segregation is not an inconvenience to route around: it is the security
property that makes "your data is unreachable from another customer's app
context" true.

So the sweep needs a different shape. The options, in the order I would try
them:

1. **An app-level index key.** One entry listing the accounts that have
   templates, written on designate and on uninstall. Small, and it keeps the
   current sweep almost unchanged. Needs confirming that an app-scoped
   (not account-scoped) key exists — ✱ unverified, and the whole approach
   depends on it.
2. **One scheduled job per region that fans out over the pub/sub queue.**
   Better shaped for the platform and it paces naturally, but it is more
   moving parts than a product with zero customers needs.
3. **Per-account scheduling.** Rejected on sight: five jobs per region.

Whichever wins, the **7 requests/second Secure Storage limit** becomes a
pacing constraint the scheduler does not currently model. Today it paces
against the monday API only. On monday code it would have to pace against its
own storage too, and the existing "stop rather than hammer" reflex is the
right one to extend.

### 3. Config is read through the SDK, not `process.env`

`requireEnv()` in `src/server/index.ts` would break. It becomes a small
`Config` interface with two implementations — `process.env` locally, the SDK's
managers on monday code — which keeps the server testable without the SDK
present, the same trick `Storage` already uses.

### 4. A `/mndy-cronjob` POST route

Small, but it must be guarded: it is an endpoint that triggers a sweep across
paying accounts, so it needs to reject anything that is not the platform
invoking it. Same posture as `/webhooks/subscription`.

---

## What I could not establish

Marked `✱` and load-bearing on the port, per CLAUDE.md rule 1:

1. **Whether an app-scoped storage key exists**, or whether every key is
   account-scoped. Decides which sweep redesign above is possible. **Most
   important open question.**
2. **Request timeout and memory limits** for a monday code container. A sweep
   is long-running; if the cron invocation has a short timeout, the sweep must
   become resumable rather than one pass.
3. **Whether the document DB** is a better fit than key-value for snapshots.
   Plausible; unread.
4. **Whether outbound calls to `api.monday.com` need the allowlist** when the
   app is already hosted on monday.
5. **Per-key size limit.** A board snapshot with many columns is a few
   kilobytes, so it is very likely fine, but "very likely" is how the `✱` list
   started.

All five are answerable in an hour with the CLI installed and the docs open in
a browser that is not this one.

---

## Recommendation

**Target monday code. Do not port yet.**

Target it, because it makes the strongest version of the argument for every
shape ADR-010 could choose — it is the better answer whether we ship read-only
or ship the monitoring, which is precisely why it should be settled first.

Do not port yet, because the port is a day of work against an API whose shape I
have only read *about*, and hard rule 1 of this project is that we do not
invent monday API behaviour. The same rule that kept automations behind a flag
applies here.

**The order:**

1. Install `@mondaycom/apps-cli`, answer the five `✱` questions above. One
   hour. Question 1 first — it decides the sweep design.
2. Run `npm run verify:live` for the API claims. Ten minutes. Same sitting.
3. *Then* decide ADR-010 with real information instead of a forced choice.
4. *Then* port: `MondayCodeStorage`, the `Config` interface, the cron route,
   and whichever sweep shape question 1 allows.

Nothing built so far is wasted by this. The diff engine does not move. The
`Storage` interface was written for exactly this substitution and now gets to
prove it. The Dockerfile and `docs/06-deployment-and-submission.md` remain the
fallback if monday code turns out not to fit — which is a real possibility
that question 2 could produce.

## Sources

- [Host your app on monday code](https://developer.monday.com/apps/docs/hosting-your-app-with-monday-code)
- [Get started with monday code hosting](https://developer.monday.com/apps/docs/get-started)
- [What is monday code? (Support)](https://support.monday.com/hc/en-us/articles/27564451145362-What-is-monday-code)
- [Schedule cron jobs in monday code](https://developer.monday.com/apps/docs/schedule-cron-jobs-in-monday-code)
- [monday code JavaScript SDK](https://developer.monday.com/apps/docs/monday-code-javascript-sdk)
- [Command line interface (CLI)](https://developer.monday.com/apps/docs/command-line-interface-cli)
- [Breaking change: Updated monday code secure storage limits](https://developer.monday.com/apps/changelog/breaking-change-updated-monday-code-secure-storage-limits)
- [Manage your app's outbound communication](https://developer.monday.com/apps/docs/manage-your-apps-outbound-communication)
- [New network security features for monday code apps](https://developer.monday.com/apps/changelog/new-network-security-features-for-monday-code-apps)
- [Privacy and security](https://developer.monday.com/apps/docs/privacy-and-security)
- [Understanding monday marketplace security (Support)](https://support.monday.com/hc/en-us/articles/360017126139-Understanding-monday-marketplace-security)
- [@mondaycom/apps-cli](https://www.npmjs.com/package/@mondaycom/apps-cli)
- [mondaycom/apps-sdk](https://github.com/mondaycom/apps-sdk)
