# End of session

Paste this before you close the laptop. It is what makes the next session
possible.

---

We are stopping here. Update the project's memory.

1. Run `python3 -m unittest discover -s tests -t .` and record the real result.
2. Update `STATUS.md`:
   * what changed this session
   * the test evidence (actual numbers, not "tests pass")
   * a **specific** "Next exact action" — a command or a decision, not a topic
   * anything now known to be broken or unverified
3. If we made a non-obvious choice, add it to `DECISIONS.md` with the reason and
   what we chose *against*.
4. If we discovered a new way this can go wrong, add it to `RISKS.md`.
5. If something is now waiting on me — a key, an account, a judgement call —
   add it to `OWNER_ACTIONS.md`.
6. Show me `git status` and tell me what is uncommitted.

Keep `STATUS.md` short. It is a resume point, not a diary — delete what is no
longer true rather than appending forever.

---
