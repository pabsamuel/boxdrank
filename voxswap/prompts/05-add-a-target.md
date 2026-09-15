# Add support for a new game or engine

Use when a customer names a title whose audio is laid out in a way VoxSwap does
not handle well yet.

---

I have an order for `<GAME TITLE>` and I need VoxSwap to handle it properly.

What I know about how it stores voice lines:

```
<PASTE A DIRECTORY LISTING OF THE EXTRACTED AUDIO, OR DESCRIBE WHAT YOU SEE>
<e.g. "everything is .bnk files", "wav files under Content/Audio/VO/<Character>/">
```

First, tell me whether this needs a **new target adapter** or just better
`include`/`roles[].match` patterns in `order.json`. Most titles only need
patterns — say so if that is the case, and give me the patterns.

If it genuinely needs an adapter, read `voxswap/targets/base.py` and
`targets/game.py`, then:

1. Add the adapter, implementing `discover`, `speaker_hint`, `delivery_path`,
   `install_notes` and `warnings`.
2. `install_notes` must contain **real, specific steps** for this engine — which
   tool, which folder, what to name the file, how to undo it. A vague
   `INSTALL.md` becomes a support ticket at midnight.
3. `warnings` must be honest about anything the customer still has to do
   themselves. Do not imply we did something we did not.
4. Register it in `targets/__init__.py` and allow it in `models.py`
   (`TARGET_ADAPTERS`) and the `new --adapter` CLI choices.
5. Add it to `docs/06-TARGETS.md`.
6. Add a test that the adapter is selectable and produces the expected delivery
   layout. Run the full suite.

If the audio is packed in a format no open tool can safely rewrite (Wwise
`.bnk`, FMOD `.bank`), do **not** attempt extraction — that is decision 12 in
`DECISIONS.md`. Deliver import-ready audio plus a mapping and honest
instructions instead.

---
