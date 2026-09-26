# Automation Watchdog — Privacy Policy

_Last updated: 26 September 2026_

> **Before publishing:** replace the two `[FILL IN]` values (the operator's
> name or company, and a support email address) and the mail provider's name,
> then host this file at a public URL — this file's GitHub URL works — and paste
> that URL into the listing's privacy policy field. This draft describes what the
> code in this repository actually does. If the app changes, change this too.

Automation Watchdog ("the app") is operated by **[FILL IN: name or company]**
("we"). This policy explains what the app reads from a monday.com account that
installs it, what it keeps, and what it sends.

## What the app does

It watches the rhythm of automations on your boards — how often each one
normally acts — and emails the person who installed it when an automation that
used to act regularly goes quiet, and again when it starts working. It never
changes anything in your account. Every permission it asks for is read-only.

## Permissions requested

| Permission | Used for |
|---|---|
| `boards:read` | Reading board names and each board's activity log |
| `users:read` | Telling actions taken by people apart from actions taken by automations |
| `me:read` | Finding out who installed the app, so alerts go to them |
| `account:read` | Finding out which account the app was installed into |

## What the app reads

- Board names and ids
- Board activity log entries: the type of event, the item or entity type, the
  id of whoever or whatever performed it, and when
- The list of the account's users, to separate people from automations
- The installing user's email address and the account id

It does **not** read item names, column values, updates, files or documents.

## What the app stores, and where

Everything is stored on monday.com's own infrastructure (monday code), not on
servers we run.

| What | Where | Kept until |
|---|---|---|
| The account's access token, the installer's email address, the install time | monday code secure storage | **Deleted when the app is uninstalled** |
| Alert state: a key per watched automation made of the board id, performer id and event type, with timestamps of when it went quiet and when we last told you | monday storage, separated per account | See below |
| A log of recent checks: when each ran, how many automations were watched, how many had stopped, whether an email was sent, and a short error summary if the check failed | monday storage, separated per account | See below |

Alert state and the check log contain **ids and timestamps, not names,
addresses or tokens**. They cannot be deleted by us after an uninstall, because
deleting them requires the account's access token and monday revokes that token
at uninstall. Whether monday removes them on uninstall is not something we
have been able to confirm.

Mutes you set in the board view are stored **in your browser only**.

## What the app sends, and to whom

Alert emails go to the address of the user who installed the app. They name the
board and describe the automation that stopped — for example, "An automation
moves an item between groups on Client Projects". They are sent through our
email delivery provider, **[FILL IN: provider name]**, which processes them only
to deliver them.

Nothing else leaves monday.com. There is no analytics, no tracking, no
advertising, and no data is sold or shared.

## Security

- The access token is kept in monday's secure storage and never written to a
  log, an email or any response; error messages are scrubbed of it.
- The app only ever sends the token to monday.com, over HTTPS; any other
  destination is refused before a request is made.
- Install links are protected against forgery with a single-use state value.
- Uninstall notifications are accepted only with a valid signature from monday.

## Your choices

Uninstalling the app stops all checks and deletes the stored token and email
address. For any question, or to ask what is held about your account, write to
**[FILL IN: support email]**.
