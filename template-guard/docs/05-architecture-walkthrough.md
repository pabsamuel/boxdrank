# Defending this architecture — gate item #2

**Purpose:** monday rejects apps "built primarily with AI-generated vibe code."
The policy is not really about who typed the characters; it is about whether a
person can answer for the code. This document is the answer key. Read it until
you can give each answer without opening the file it describes.

**How to use it:** the left column is a question a reviewer (or a customer, or
a future you) actually asks. The right is the answer, with the file to open if
they push. If you cannot give an answer in your own words, that module is your
weak point — go read it, then come back.

---

## 1. The one-paragraph version

> Template Guard reads the *structure* of a monday board — columns, their
> types, their settings, groups, views, board connections — and compares a
> duplicated board against a snapshot of the template it came from. It reports
> what monday silently dropped during duplication, ranked by how badly it will
> hurt. It never reads a single item.

If you can say that cold, you have the product. The rest is how.

---

## 2. The hard problem, and why it is the hard problem

**Duplicated boards get brand-new column IDs.** There is no join key. The
template's "Status" column is `c_status1`; the copy's is something else
entirely. Everything difficult in this codebase follows from that one fact.

So the diff cannot be a set comparison. It has to *infer* which column in the
copy corresponds to which column in the template, and inference can be wrong.
Being wrong in either direction has a cost:

| Wrong direction | What the user sees | Cost |
|---|---|---|
| Missed a real difference | A clean-looking report on a broken board | They keep the broken board. Bad. |
| Invented a difference | A "renamed column" that was really one deleted and one added | **Worse.** They stop trusting the tool, and then the real finding gets ignored too. |

That asymmetry — false positives are worse than false negatives here — is the
single most important design judgement in the project, and it explains choices
that otherwise look over-cautious.

---

## 3. `src/diff/match.ts` — the matcher

Four passes, most confident first. Each pass only considers columns still
unmatched after the previous one.

| Pass | Rule | Confidence |
|---|---|---|
| 1 | Same normalized title **and** same type, unambiguous on both sides | `certain` |
| 2 | Same title, different type — the type change *is* the finding | `certain` |
| 3 | Same type, same ordinal position, titles similar enough (≥ 0.6) to be a rename | `likely` |
| 4 | The lone unmatched column of a **distinctive** type on each side | `likely` |

**Q: Why is pass 4 restricted to distinctive types?**
Because without that restriction it pairs any two leftover `text` columns. In
testing it confidently matched "Scope Notes" to "Invoice Reference" purely
because each was the last remaining text column on its side — producing a
false "renamed" finding where the truth was one column removed and one added.
Two wrong findings from one bad guess. `GENERIC_COLUMN_TYPES` (text, long_text,
numbers, date, status, people, dropdown, checkbox, email, phone, link, file) is
excluded from that pass. A `board_relation` or a `mirror` column is distinctive
enough that being the only one of its type is real evidence; a text column is
not.

**Q: Why normalize titles, and how?**
`normalizeTitle` lowercases, strips diacritics, and collapses whitespace, so
"Kickoff Date" and "kickoff  date" are the same column and a copy that gained a
trailing space is not reported as a rename.

**Q: What is `titleSimilarity`?**
Levenshtein edit distance normalized by the longer string's length, giving 0–1.
The 0.6 threshold in pass 3 is a judgement call, not a derived constant, and it
only ever produces `likely` matches — never `certain`.

**Q: What does `likely` mean to the user?**
The UI says "(best guess)". A rename and a delete-plus-add are genuinely
indistinguishable from outside monday; presenting a guess as a certainty would
be its own kind of silent failure, which is the thing this product sells
against.

---

## 4. `src/diff/connect.ts` — mis-wiring, the finding that matters most

When you duplicate a board, a connect-board (`board_relation`) column keeps
pointing at the board ID it was copied from. The new client's board now reads
and writes the *template's* board. Nothing errors. Linked items appear.
Automations run. Every one of those items is on the wrong board.

That is why `miswired` is the top severity and why it stays on the free tier.

**Q: How do you find the linked board IDs?**
`linkedBoardIds()` reads the column's typed `settings` object, trying four
plausible key spellings (`boardIds`, `board_ids`, `boardsIds`,
`linkedBoardIds`) plus one level of nesting.

**Q: Four spellings? That is guessing.**
Yes — and it is flagged `✱` as unverified in `docs/00-api-findings.md`, because
`developer.monday.com` was unreachable from the build environment. It is the
**highest-priority thing to verify against a live account**, for a specific
reason: guessing wrong there does not throw. It would return "no linked boards"
for every column, which the app would render as *every board is correctly
wired* — the single worst failure this product could have.

**Q: So what happens when it understands nothing?**
`linkedBoardIds()` returns **`null`, not `[]`**. `null` means "we could not
look"; `[]` means "we looked, there is nothing." `compareWiring()` turns `null`
into `indeterminate`, and an indeterminate connect column is reported at
`miswired` severity, not skipped. **We will not tell you a column is fine when
we do not know.** That `null`/`[]` distinction is ADR-005 and it is enforced
throughout the codebase.

---

## 5. `src/api/` — the monday boundary

**Q: Which API version, and why is that a question at all?**
`2026-07`, pinned in exactly one place: `src/api/version.ts`. monday ships
quarterly and guarantees six months of stability per version. Pinning means a
monday release cannot break customers between one afternoon and the next; the
cost is a deliberate migration review each quarter.

**Q: Can you read automations? The whole premise is 44 automations became 39.**
Only on monday's **dev (preview)** schema, which monday documents as "subject
to change" and which **cannot be version-pinned** — so the entire mitigation
strategy for this API does not apply to it.

That is why automations sit behind `FEATURE_AUTOMATIONS_PREVIEW`, default
**off**, read-only, confined to one adapter (`src/api/preview/automations.ts`),
and why `assertNoPaidPreviewDependency()` enforces that no paid tier depends on
it. If monday changes the preview schema tomorrow, that section degrades to a
labelled "could not read automations" and nothing else moves. We do not take
money for a feature monday can remove without notice. (ADR-002.)

**Q: What about rate limits?**
`MondayClient.request()` returns `{ data, errors }` together — it never
discards a partial result — and retries 429s and 5xxs with exponential backoff
plus jitter, honouring `Retry-After`. Board reads are batched. The app never
requests items, so a board with 5,000 rows costs the same as one with 5.

**Q: Any live traps you know about?**
One, and it is nasty: the **2026-07 User entity migration** capped `users` at
200 per page and made over-reading **fail silently**. `BOARD_PEOPLE_QUERY`
paginates explicitly and records a failure rather than returning a truncated
list.

---

## 6. `src/server/` — data handling, the part security review cares about

**Q: What do you store?**
Board IDs, column IDs, and configuration. Nothing else. No item names, no
column values, no files, no update text, no user emails.

**Q: How would a reviewer know that is true rather than a promise?**
Two ways, neither of which is a policy document. First, the app requests no
item, update, or file scopes — not holding the permission beats promising not
to use it. Second, `assertNoItemData()` in `src/server/storage.ts` walks every
snapshot before it is written and throws if it finds `items`, `items_page`,
`column_values`, `updates` or `assets` anywhere in the graph. It runs on every
save in both storage implementations, before serialisation.

**Q: Tokens?**
AES-256-GCM at rest, `TokenCipher`. GCM means a tampered ciphertext fails
authentication rather than decrypting to garbage — there is a test for exactly
that. The key is 32 bytes from the environment; a wrong-sized key fails at
startup rather than at first use.

**Q: Why SQLite?**
One ops person per account, a handful of snapshots each. That is a file, not a
cluster — and a file means no database server on a port and no second
connection string. The cost is stated in ADR-013: `node:sqlite` is experimental
and single-process. Both stop mattering when it becomes Postgres, which is one
new file implementing the same `Storage` interface. `test/storage.test.ts` runs
the identical suite against both implementations so that claim stays true.

**Q: Which writes does the app perform?**
Three mutations, all opt-in per item after a confirmation that shows exactly
what will change: `create_column`, `create_group`, `change_column_title`.
Nothing writes to a board the user did not select. Notably, the *most severe*
finding — a mis-wired connect column — is **not** auto-repairable: re-pointing
a connect column can silently break existing links, so it is a deep-linked
manual checklist item with an explanation (ADR-006, `MISWIRED_IS_MANUAL`).

**Q: Why does the app write at all, given a read-only version would be an
easier review?**
That is an open decision, documented in ADR-010 and
`docs/03-merge-with-board-schema-auditor.md`, with a recommendation to ship
read-only first. Saying this out loud is better than defending a choice that
has not actually been made.

---

## 7. `src/drift/` — monitoring

**Q: What stops a sweep from getting the app rate-limited?**
Accounts one at a time with a pause between them; small board batches inside
each account; a hard per-run board budget; and a rate-limit response ends that
account's sweep rather than retrying. Being an hour late with a drift alert
costs nothing. Losing the app's API access costs every customer at once.

**Q: What stops two sweeps running at once?**
A `running` flag. A tick arriving mid-sweep is skipped and **counted**, and the
counter is exposed on `/health`. The flag clears in a `finally` — a stuck flag
would be a monitor that has silently stopped monitoring, which is this product
failing in precisely its own signature way.

**Q: What does the monitor do about boards it could not check?**
Reports them, with a reason, per board. `DriftReport` carries `skippedBoardIds`
and a parallel `skipReasons`. Cosmetic-only drift does not notify — a monitor
that emails about a column width trains people to ignore it.

---

## 8. `catch {}`

There is none in this codebase, and that is the answer to a whole family of
questions.

A read that partly fails produces a snapshot *plus* typed `PartialFailure`s
(`kind`, `scope`, `message`, `degradesDiff`). `DiffResult` carries
`basedOnIncompleteData` and `dataWarnings`, and the UI renders an unmissable
alarm when they are set.

**Q: Then why is `automationCoverage` a separate field?**
Because the flag is off by default, so folding "automations were not checked"
into `basedOnIncompleteData` would put a red banner on *every comparison the
product ever shows*, and a permanent alarm is wallpaper. Two notices,
deliberately different volumes: an alarm for a read that was expected to
succeed and did not, a quiet footnote for a section that is outside the stable
API by design. (ADR-008, `src/ui/components/Notices.tsx`.)

There are exactly three bare `catch` blocks in `src/`, and none of them loses
information. Know them, because a reviewer who greps will find them:

- `parseSettings` (`snapshot/capture.ts`) returns `null` on a malformed
  settings blob — and the caller turns that `null` into a visible
  `PartialFailure`.
- `api.ts` on a non-JSON response body **throws** a user-facing `ApiError`
  carrying the HTTP status.
- `serializeDefaults` (`repair/execute.ts`) returns `null` if settings will not
  serialise, so the column is still created and the user can see it lacks the
  template's options.

Each one converts an exception into a reported state. That is the rule: the
swallow is local, the report never is.

---

## 9. Tests — what they are actually for

109 tests, no network, no credentials. The diff engine is pure, which is
deliberate: the matching heuristics are the riskiest part of the product, so
they have to be testable in isolation from monday entirely.

The four required fixture cases: a missing automation, a mis-wired cross-board
reference, a renamed column, and a changed column type.

**Q: Name a test that caught a real design bug.**
`cleanCopy` — a perfectly healthy duplicate — must produce zero non-cosmetic
findings. It failed twice during development, and both times the *design* was
wrong rather than the assertion: once because a clean copy was being flagged
`basedOnIncompleteData` merely for having automations unread (fixed by ADR-008,
above), and once because pass 4 paired two unrelated text columns (fixed by
`GENERIC_COLUMN_TYPES`, ADR-007). That fixture is the false-positive tripwire
for the whole matcher.

---

## 10. The honest answers

Have these ready, because the credible version of this conversation includes
them.

- **"Has this run against a live monday account?"** No. Five claims are marked
  `✱` in the source and listed in the README's *Before you ship*. The
  `configuration` shape from `board_automations` and the settings key holding
  linked board IDs are the two that matter; each is isolated behind one named
  function, so verification is a morning with a dev account.
- **"Did you write this?"** It was written with Claude, in a session where I
  set the constraints: pin the API version, isolate the preview schema, never
  store item data, fail loudly, price per account. Those constraints are in
  `CLAUDE.md`, and every architectural decision is in `docs/02-decisions.md`
  with its reasoning and what it costs. The test that made me split
  `automationCoverage` out of `basedOnIncompleteData` is a decision about what
  the user sees, and I can defend it either way.
- **"What is the weakest part?"** The matcher's pass 3 and pass 4 heuristics.
  They are guesses, they are labelled as guesses in the UI, and a rename versus
  a delete-plus-add is not decidable from outside monday. Second weakest: the
  product shape is not settled (ADR-010).

---

## Cross-references

- Working agreement and hard rules: `CLAUDE.md`
- API findings, with every unverified claim marked `✱`: `docs/00-api-findings.md`
- Every architectural decision and what it cost: `docs/02-decisions.md`
- Product-shape conflict: `docs/03-merge-with-board-schema-auditor.md`
- Marketplace scan and the demand question: `docs/04-marketplace-scan.md`
