# API verification — do this before anything else

Everything in `src/monday-client.js` and every flag in `POLICY`
(`src/permissions.js`) is a guess made from published documentation. None of it
has been run against a live monday account.

This matters more here than in a normal project. SeatGuard's core claim is a
dollar figure — "reclaim $64/month" — and a customer who finds that number wrong
will not give you a second chance. **Verify first, build second.**

Budget: an afternoon. You need a free monday account and a personal API token
(Profile → Developers → My access tokens).

---

## 1. Which API version?

- [ ] What is the current stable API version string? (`API_VERSION` in
      `src/monday-client.js` is pinned to a guess.)
- [ ] What is the deprecation window between versions?

## 2. Do these queries actually run?

Paste each into monday's API playground and record the real response shape.

- [ ] `USERS_QUERY` — does `last_activity` exist? What is its exact name and
      format? **If this field does not exist, the dormant-seat rule has no input
      and the whole product changes.** Fallbacks to investigate: `activity_logs`
      per board, or the `updates` a user has authored.
- [ ] Is `is_pending` a real field? Do pending users consume a billable seat?
      (`stalePendingInvites` deliberately claims no savings until this is known.)
- [ ] `WORKSPACES_QUERY` — what are the real `kind` values? The code assumes
      `open` / `closed`.
- [ ] Does a workspace expose its member list, and under what field name? The
      snapshot needs `memberIds` to resolve closed-workspace access.
- [ ] `BOARDS_QUERY` — what are the real `board_kind` values? The code assumes
      `public` / `share` / `private`.
- [ ] Are `owners` and `subscribers` genuinely separate on a board?
- [ ] Does `state: all` return archived and deleted boards? Which states exist?

## 3. Permission semantics — the `POLICY` flags

Test each one **empirically** with two accounts. Do not infer from docs.

- [ ] `adminsBypassBoardPermissions` — can an account admin open a main board
      they are not subscribed to?
- [ ] `adminsSeePrivateBoards` — can an admin open someone else's *private*
      board? (Assumed **no**. If this is wrong, the "private board, admin not
      subscribed" result is wrong on every account.)
- [ ] `openWorkspaceGrantsBoardAccess` — does an open workspace grant every
      account member access to its main boards?
- [ ] `guestsRequireExplicitBoardAccess` — can a guest reach anything they were
      not explicitly added to?
- [ ] `guestsOnlyOnShareableBoards` — can a guest be added to a main board at
      all, or only shareable ones?

Each answer changes one line in `POLICY`. Update the comment next to it with
what you observed and the date.

## 4. Limits

- [ ] What is the complexity budget per minute, and what does a 429 return?
- [ ] How many boards can one query return before hitting the limit?
- [ ] Roughly how long does a full account read take at 100, 500, 2000 boards?
      This sets whether audits can run on demand or must be queued.

## 5. Scopes and install

- [ ] Minimum OAuth scopes to read users, workspaces, boards and permissions.
      **Request the minimum.** Every extra scope is a question in security review.
- [ ] Does reading board subscribers need a scope beyond `boards:read`?
- [ ] What does the marketplace app review actually check?

---

## When you're done

1. Update `API_VERSION` and the three query documents.
2. Update each `POLICY` flag, with a dated comment recording what you saw.
3. Delete the "unverified" warnings from `CLAUDE.md`, `README.md` and the header
   of `src/monday-client.js` — but **only** for the parts you actually confirmed.
4. Write `fixtures/real-account.sanitised.json` from your own account, with names
   and emails replaced. A second fixture drawn from reality catches the
   assumptions the demo fixture shares with the code.
5. Re-run `npm test`. If a rule's behaviour changed, the tests should have
   caught it — if they didn't, add the test that would have.

## If `last_activity` doesn't exist

This is the one finding that could sink the product, so decide early:

- **Plan A:** another field carries it. Use that.
- **Plan B:** derive activity from `activity_logs` across boards. Expensive, but
  a scheduled weekly scan makes it viable.
- **Plan C:** the product leads with permissions and governance rather than seat
  reclamation. Weaker pitch — no dollar figure — so only take this if A and B
  both fail.
