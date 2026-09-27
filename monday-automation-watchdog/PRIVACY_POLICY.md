# Automation Watchdog — Privacy Policy

_Last updated: 27 September 2026_

> **Before publishing:** replace the `[FILL IN]` values (the operator's name or
> company, and a support email address — monday requires the same entity name
> here as in the terms of service, and a support email on a domain the operator
> owns), then host this file at a public URL and paste that URL into the
> listing's privacy policy field. This draft describes what the code in this
> repository actually does. If the app changes, change this too.

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
- The list of the account's users (ids and names), only to tell actions by
  people apart from actions by automations; it is not stored
- The installing user's email address and the account id
- Whether the account has a plan for the app (plan id, whether it is a trial,
  days left), when monday's billing applies, to decide whether to send alerts;
  it is not stored

It does **not** read item names, column values, updates, files or documents:
the activity log is requested without the field that would carry them.

The board view reads the same activity **in your browser**, directly from
monday.com, to show you the results. That reading does not pass through our
server.

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

Mutes you set in the board view, and whether you have seen its welcome page,
are stored **in your browser only**.

## Logs

The app's server writes short operational log lines to monday code's logging:
installs and uninstalls with the account id, whether the email provider
answered at startup, and check failures with their error text, scrubbed of
access tokens and secrets. That error text comes from monday.com or the email
provider; a delivery error can include the address it could not deliver to.
How long monday code keeps logs is set by monday.com.

## What the app sends, and to whom

Alert emails go to the address of the user who installed the app. They name the
board and describe the automation that stopped — for example, "An automation
moves an item between groups on Client Projects".

## Third parties

| Who | Why |
|---|---|
| monday.com | The app runs on monday code, monday.com's hosting, and stores everything listed above there |
| Google (Gmail) | Delivers alert emails over SMTP; it processes each email only to deliver it |

Nothing else leaves monday.com. There is no analytics, no tracking cookies, no
advertising, and no data is sold or shared. The only cookie the app sets is a
short-lived, HttpOnly security cookie used during installation.

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
