# Prompts

Copy-paste prompts for working on this project with Claude Code. You do not need
to explain the project each time — each prompt tells Claude what to read first.

## How to use one

1. Open a terminal in the `voxswap/` folder.
2. Start Claude Code (`claude`).
3. Open the prompt file, copy the block between the `---` markers, paste it.
4. Replace anything in `<ANGLE BRACKETS>` with your real values.

That is the whole workflow. If you only ever use two of these, use
`00-session-start.md` and `02-debug-a-failed-job.md`.

## Which one do I want?

| Situation | Prompt |
| --- | --- |
| Starting any session | [`00-session-start.md`](00-session-start.md) |
| A customer emailed me and I need an order set up | [`01-new-order.md`](01-new-order.md) |
| A job failed and I do not understand the error | [`02-debug-a-failed-job.md`](02-debug-a-failed-job.md) |
| It ran but it sounds wrong | [`03-fix-quality.md`](03-fix-quality.md) |
| I want to support a new provider | [`04-add-a-provider.md`](04-add-a-provider.md) |
| A new game engine I have not handled before | [`05-add-a-target.md`](05-add-a-target.md) |
| I want to reply to a customer | [`06-customer-replies.md`](06-customer-replies.md) |
| I want to build a new feature | [`07-build-a-feature.md`](07-build-a-feature.md) |
| End of a working session | [`08-end-of-session.md`](08-end-of-session.md) |
| Once a week, to stay on top of things | [`09-weekly-review.md`](09-weekly-review.md) |

## Things worth knowing

* **Claude already has rules for this repo** in `CLAUDE.md` — including that it
  must never weaken the consent gate, never add a runtime dependency to the
  core, and never claim something works without running the tests. You do not
  have to repeat those.
* **`STATUS.md` is the memory.** It is how a session three weeks from now knows
  where you got to. `00-session-start.md` reads it and `08-end-of-session.md`
  updates it.
* **Paste the actual error text**, not a description of it. The errors in this
  project are written to be useful; summarising them throws that away.
* **You can just talk to it.** These prompts are a starting point for when you
  do not know what to say, not a language you have to speak.
