# How to build this with Claude (you don't need to be good at it)

You don't need clever prompting. You need a repeatable rhythm. Here it is.

## The rhythm

1. Open a **fresh** Claude Code session in the `trendghost/` folder.
2. Paste the next numbered prompt from this folder. That's it — the prompt already tells Claude to read `STATUS.md`, `CLAUDE.md` and the specs.
3. When it says it's done, ask for proof: **"Show me the output of `npm run verify`, then tell me exactly what to run to see it on my phone."**
4. Look at it on your actual phone. Nothing about this project can be judged on a laptop.
5. Tell Claude what's wrong in plain language ("the ghost is too big", "my arm is green when it's clearly not"). Plain language is fine — it has the specs to translate it.
6. Say: **"Update STATUS.md and commit."**
7. Close the session. Open a new one for the next phase.

That's the whole method. Steps 3 and 6 are the ones people skip, and they're the ones that make the next session work.

## Why a new session per phase

Long sessions get muddled and expensive. `STATUS.md` is the memory — if it's accurate, a brand-new session picks up exactly where the last one stopped. That's why every prompt ends with "update STATUS.md".

## Five phrases that fix almost everything

- **"Read STATUS.md and docs/, then tell me your plan before you write code."** — use this whenever a task feels big. Cheap to read a plan, expensive to unpick bad code.
- **"Don't tell me it works. Run it and show me the output."**
- **"That's more than I asked for. Do only X."** — scope creep is the main failure mode.
- **"Why did you choose that? What's the simpler option?"**
- **"Stop. Write down what you know in STATUS.md, then we'll continue."** — use this when a session is going in circles.

## When something is wrong, describe the symptom, not the fix

Good: *"When I raise my left arm the ghost's right arm lights up."*
Less good: *"Flip the mirror matrix in the renderer."*

You'll usually be wrong about the fix, and Claude will dutifully implement your wrong fix. Symptoms it can debug.

## Things to never accept

- "It should work now" with no command output.
- A new library added without a reason.
- Anything that downloads TikTok/Instagram videos. It's in `CLAUDE.md` rule 5 for a reason — it would sink the project.
- A phase marked ✅ in `STATUS.md` that you haven't seen running.

## Order of prompts

`00-KICKOFF.md` once, then `01` → `09` in order. Don't skip ahead — phase 4 (the scoring) is meaningless without phase 2's timelines, and phase 1 exists to prove the whole idea runs on your phone before you invest in the rest.
