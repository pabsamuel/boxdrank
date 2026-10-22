# Automation Watchdog: ready answers for monday's review questions

**Why this exists.** On 16 Oct 2026 monday's reviewer asked five questions
about Automation Inventory, under "updated Marketplace standards"
(`../monday-automation-inventory/PROGRESS.md` item 30). Watchdog was submitted
the same day and is in the same queue (support ticket #5255645, 9 Oct). The
same email is likely for Watchdog (INFERENCE). These answers are ready so the
reply can go out the same day.

**21 Oct 2026: Inventory was rejected** for "significantly overlaps with
monday.com native functionality" (`../monday-automation-inventory/DECISIONS.md`).
The lesson for this reply (INFERENCE): lead with what no native feature does,
the silent switch-off and the alert, and do not lead with the board view's
list of automations, which is the part the Autopilot hub resembles. The order
below already does that; keep it.

Every claim below is sourced in `COMPETITORS.md` or `VALIDATION.md`. Change
nothing into a claim those files do not support. If the reviewer's questions
differ, answer theirs, not these.

**Video:** `../monday-automation-watchdog/listing/automation-watchdog.mp4`
(the listing video, sample data). As with Inventory, offer a recording inside
a live account if they want one.

Before sending: check the attached video still matches the live v4 view
(the run-status strip and "Set up email alerts" link were moved above the
empty-account message on 1 Oct).

---

Hi <reviewer's first name>,

Thank you for the review. Here are the details, focused on the core use case.

1. Customer pain point
monday switches an automation off in several situations and, for some of
them, tells no one. monday's own help article "Why is my automation
deactivated?" says so for three of them: when the automation's owner is
deactivated ("You will not receive a notification stating that the
automation was deactivated"), when its creator loses permissions ("You will
not receive a notification that informs you of this change"), and when it
hits a rate limit (an error on that board's Automations page only). Its own
FAQ adds: "Some deactivation scenarios do not send a notification. In those
cases, check the board's Automations page for inactive automation errors."
With dozens of boards, nobody checks every Automations page, so an
automation can be off for weeks before anyone notices the work it stopped
doing. Community users ask for exactly this: one with 200+ workflows wrote
that they "had to create a group of automations and workflows to check to
see if there was a failure".

2. Use case and target user
The target user is the account admin or operations lead responsible for
automations across many boards. The main use case: "Tell me when an
automation that used to run regularly goes quiet, and when it recovers."
The typical moment is offboarding: someone leaves, their account is
deactivated, and every automation they owned stops silently.

3. Value and outcome
- Watchdog learns how often each automation normally acts on the boards the
  admin can see, and emails the admin when one that used to run regularly
  goes quiet, and again when it recovers.
- A board view lists every recurring automation and its state. An alert the
  admin already knows about can be muted for a day, a week, 90 days or until
  it works again, never forever.
- Through sidekick, the admin can ask "which of my automations have
  stopped?"
The outcome is learning the morning after that, for example, the automation
routing new leads stopped, instead of weeks later from a missed customer.

4. Differentiation
- The board's Automations page shows the error, but only to someone who
  opens that board. Watchdog checks every board daily and sends the alert.
- The Autopilot hub's Health tab lists automations that fail, with a root
  cause. An automation that monday has switched off no longer runs, so it no
  longer fails, and it does not show there. That silent case is what
  Watchdog covers.
- The "Keep automations running when users are deactivated" setting (a
  default owner) prevents one cause, but only if it was set up before the
  person left, and it does not cover permissions or rate limits.
- Marketplace: in monday's public catalog (1,293 apps, searched 26 Sep 2026)
  no app monitors monday's own automations for going quiet or being
  deactivated.
- Scope: read-only scopes; the app never changes a board, an item or an
  automation. It stores only the account's access token, the installer's
  email address and the install time, on monday code, to run the daily check
  and send the alerts, and deletes them when the app is uninstalled.

5. Demonstration
A short walkthrough is attached. It shows the board view with each recurring
automation, its usual rhythm and its state, an automation flagged as gone
quiet, the alert email, and the recovery email. If you would prefer a
recording made inside a live monday account, I can send one.

If anything else would help the review, I'm happy to provide it.

Best regards,
Samet Ateşen
Atesen Software
support@atesensoftware.com

---

## Checks before this is sent (Claude, on the day)

- Re-read point 4's storage sentence against
  `../monday-automation-watchdog/PRIVACY_POLICY.md`; it must match word for
  word in substance.
- Point 5 describes the video: open it and confirm each item appears. Drop
  any that do not.
- The Autopilot hub can change. If the reviewer says the Health tab now
  shows switched-off automations, re-check the help article before
  answering.
