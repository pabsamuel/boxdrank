# Build a feature

Use when you want something new. Works best if you describe the *problem*, not
the solution — the answer is often smaller than you expected.

---

I want to add something to VoxSwap.

What I actually want, and why:

```
<DESCRIBE THE PROBLEM, NOT THE IMPLEMENTATION.
 e.g. "I keep forgetting which orders are waiting on a consent form"
 e.g. "I want to hear a preview before I send the whole thing"
 e.g. "I want to know what an order cost me">
```

Before writing any code:

1. Check `ROADMAP.md` — is this already planned, or explicitly in "deliberately
   not planned"? If it is in the latter, tell me why and make me argue for it.
2. Check `DECISIONS.md` — does this conflict with an existing decision?
3. Tell me the **smallest version** that would solve my actual problem. If a
   two-line change to an existing command would do it, say that instead of
   building a subsystem.

Then, once I agree:

* Follow `CLAUDE.md`. In particular: no new runtime dependency in the core, no
  weakening of the consent gate, no stub that pretends to work.
* Put it in the right place — a stage in `stages/`, a provider in `providers/`,
  a CLI command in `cli.py`, an audio primitive in `audio/`.
* Write tests for it, in stdlib `unittest`, with no network.
* Update the relevant `docs/` page **in the same change**.
* Run `python3 -m unittest discover -s tests -t .` and the demo order, and show
  me the output.
* Add a line to `STATUS.md`.

If you end up disagreeing with what I asked for, say so once, clearly, and then
either build what I asked for or tell me what you are building instead and why.

---
