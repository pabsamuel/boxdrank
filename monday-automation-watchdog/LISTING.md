# Automation Watchdog — marketplace listing copy (draft)

Everything here describes what the code does today. The two `[FILL IN]` values
are decisions, not facts, and are left for the owner.

## App name

Automation Watchdog

## Tagline

Know when an automation stops working — including the ones monday doesn't tell you about.

## Short description

When someone leaves, their automations die, and monday doesn't tell you.
Automation Watchdog notices when an automation that used to run regularly goes
quiet, and emails you.

## Description

Automations fail quietly. monday's own help center lists eight ways an
automation gets deactivated, and says plainly that some of them send no
notification — including the most ordinary one: the person who built it being
deactivated when they leave. The only trace is an error on each board's
Automations page, which nobody opens until something has already gone wrong.

Automation Watchdog learns how often each automation normally acts — every
hour, every morning, every weekday — and tells you when one stops.

**What it does**

- Watches every board you can see, with no setup and no rules to write
- Learns each automation's normal rhythm, and allows for weekends and quiet days
  so you are not woken by false alarms
- Emails you once when an automation goes quiet, reminds you rarely, and tells
  you when it starts working again
- Lets you mute an alert you already know about — for up to 90 days, never
  forever, so a mute cannot become a new blind spot
- Shows every watched automation, its normal rhythm and its current state on a board view

**What it asks for**

Read-only access, and nothing else. It never changes a board, an item or an
automation.

**What it does not do**

- It cannot see an automation that acts too rarely to have a rhythm — something
  that fires once a month will not be flagged when it stops
- It does not read item names, column values, updates or files

## Pricing

[FILL IN: price and plan structure]

## Categories

[FILL IN: from monday's list at submission]

## Links

- Privacy policy: this repository's `PRIVACY_POLICY.md`, once the `[FILL IN]`
  values in it are completed
- Support: [FILL IN: support email]

## Assets still needed

- Screenshots of the board view **inside a real monday account**. The demo mode
  works, but a reviewer should see the product where it runs.
- An icon.

The required sizes are on monday's listing page in the Developer Center and were
not checked here; they are the owner's to read at submission.

## Notes for the review team

- Hosted entirely on monday code. Storage and secure storage are monday's own.
- OAuth scopes: `boards:read`, `users:read`, `me:read`, `account:read`. All
  read-only; the reason for each is in `PRIVACY_POLICY.md`.
- The scheduled check is a monday code cron job at `/mndy-cronjob/check`.
- Uninstall events are verified against the client secret and delete the stored
  token and email address.
- The code is in `monday-automation-watchdog/` in this repository, with 236
  offline tests, three security reviews and their fixes recorded in the README.
