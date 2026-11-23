# Automation Inventory — Privacy Policy

_Last updated: 28 September 2026_

Automation Inventory ("the app") is operated by **Samet Ateşen** ("we"). This
policy explains what the app reads from a monday.com account that installs it,
what it keeps, and what it sends. It describes what the app's code does. If the
app changes, this policy changes with it.

## What the app does

It lists the automations on the boards you can see in monday.com, in one list
you can search and filter: whether each one is switched on, and any warning
monday.com shows on it. monday.com's AI assistant, sidekick, can search the same
list for you. The app only reads. It never changes a board, an item or an
automation.

## Permission requested

| Permission | Used for |
|---|---|
| `boards:read` | Reading your boards and the automations on them |

## What the app reads

- Each board's id, name and web address.
- The automations on each board: their name, description, whether they are
  switched on, the warning monday.com shows on them (if any), and when they were
  created and last changed.
- For boards whose automations were set up in monday.com's older way only: the
  board's column titles, its status column labels and its group names. monday.com
  describes those automations with placeholders ("when status changes to
  something"), and these names turn that into what the automation actually does
  ("when Status changes to Done").
- Whether your account has a plan for the app, when monday.com's billing
  applies to the sidekick tool. This is not stored.

It does **not** ask for items, item names, column values, updates, files,
documents, or anyone's name or email address. For older automations, monday.com
also sends the automation creator's user id; the app does not keep or use it.

## Where the reading happens

- **In the app's page**, the list is read **in your browser**, directly from
  monday.com, with your own monday.com session, each time you open it. It does
  not pass through our server.
- **When sidekick asks**, the app's server reads the same list at that moment
  with a token monday.com issues for that one request (valid for five minutes),
  answers with the matching automations' names, boards, states and warnings, and keeps
  nothing. The answer goes back to sidekick.

## What the app stores

**Nothing about your account.** There is no database. The app keeps no tokens,
no email addresses, and no copy of your boards or automations.

Your browser keeps one note: whether you have seen the app's welcome page.

## Logs

The app's server writes short operational log lines to monday.com's hosting
logs (monday code):
- for each sidekick request, your account id and three numbers: how many
  automations matched, how many there were, and how many boards were read;
- errors, scrubbed of tokens and secrets.

Board and automation names are never logged. How long monday code keeps logs is
set by monday.com.

## Third parties

| Who | Why |
|---|---|
| monday.com | The app runs on monday code, monday.com's own hosting, and reads your data from monday.com's API |

Nothing leaves monday.com. There is no analytics, no tracking, no cookies, no
advertising, and no data is sold or shared.

## Security

- Requests from sidekick are accepted only with a valid signature from
  monday.com, checked for expiry and for being meant for this app.
- The per-request token is used only to call monday.com over HTTPS, is never
  written to a log or a response, and is discarded after the request.
- Links the app opens are checked to be monday.com addresses.

## Your choices

Uninstalling the app stops it. Because it stores nothing about your account,
there is nothing left to delete. For any question, write to
**support@atesensoftware.com**.
