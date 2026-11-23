# Unanswered Updates — Privacy Policy

_Last updated: 8 October 2026_

Unanswered Updates ("the app") is operated by **Samet Ateşen** ("we"). This
policy explains what the app reads from a monday.com account that installs it,
what it keeps, and what it sends. It describes what the app's code does. If the
app changes, this policy changes with it.

## What the app does

It lists the item updates nobody has answered, from the boards you can see in
monday.com: your own updates still waiting for an answer, updates that
@mention you, or everyone's. monday.com's AI assistant, sidekick, can ask it the
same questions for you. The app only reads. It never posts, changes or deletes
an update, an item or a board.

## Permissions requested

| Permission | Used for |
|---|---|
| `updates:read` | Reading the updates of the last 30 days, and who replied to them and when |
| `boards:read` | The name and web address of the item each update is on, and the name of its board |
| `users:read` | The name of the person who wrote each update |

## What the app reads

- The updates written in the last 30 days on the boards you can see: their
  text, who wrote them (user id and name) and when, and the item and board
  they are on (ids, names, and the item's web address).
- For each update's replies: who wrote each reply and when. **Not the replies'
  text.**
- The people an update @mentions, as they appear in its text (user id and
  name).
- Your own monday.com user id, so the app can tell which updates are yours and
  which mention you.
- Whether your account has a plan for the app, when monday.com's billing
  applies to the sidekick tool. This is not stored.

It does **not** ask for column values, files, documents, email addresses, or
the text of replies.

## Where the reading happens

- **In the app's page**, the updates are read **in your browser**, directly
  from monday.com, with your own monday.com session, each time you open it.
  They do not pass through our server.
- **When sidekick asks**, the app's server reads the same updates at that moment
  with a token monday.com issues for that one request (valid for five minutes),
  answers with the unanswered ones (their text, author, age, item and board)
  and two counts, and keeps nothing. The answer goes back to sidekick.

## What the app stores

**Nothing about your account.** There is no database. The app keeps no tokens,
no email addresses, and no copy of your updates, items, boards or names.

Your browser keeps one note: whether you have seen the app's welcome page.

## Logs

The app's server writes short operational log lines to monday.com's hosting
logs (monday code):
- for each sidekick request, your account id and two numbers: how many
  unanswered updates were found, and how many updates were checked;
- errors, scrubbed of tokens and secrets.

Update text, names, and item and board names are never logged. How long
monday code keeps logs is set by monday.com.

## Third parties

| Who | Why |
|---|---|
| monday.com | The app runs on monday code, monday.com's own hosting, reads your data from monday.com's API, and answers sidekick, monday.com's own assistant |

Nothing leaves monday.com. There is no analytics, no tracking, no cookies, no
advertising, and no data is sold or shared.

## Security

- Requests from sidekick are accepted only with a valid signature from
  monday.com, checked for expiry and for being meant for this app.
- The per-request token is used only to call monday.com over HTTPS, is never
  written to a log or a response, and is discarded after the request.
- Update text is shown as text, never run as code.
- Links the app opens are checked to be monday.com addresses.

## Your choices

Uninstalling the app stops it. Because it stores nothing about your account,
there is nothing left to delete. For any question, write to
**support@atesensoftware.com**.
