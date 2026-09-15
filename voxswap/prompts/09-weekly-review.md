# Weekly review

Once a week, 15 minutes. This is the project management you said you are bad at,
turned into a prompt.

---

Weekly review. Read `STATUS.md`, `ROADMAP.md`, `RISKS.md` and `OWNER_ACTIONS.md`,
and look at the actual state of `orders/`.

Tell me:

1. **Orders.** Run `python3 -m voxswap list`. For each one that is not `done`:
   how long has it been sitting there, what is it waiting on, and is it waiting
   on me or on the customer?
2. **Stuck.** Anything waiting on a consent form for more than 7 days — draft the
   chase message, or tell me to refund and close it.
3. **Failures.** Any order in a `failed` state that I have not dealt with.
4. **Money.** For finished orders this week: count the characters synthesised
   (from `work/<id>/state.json`, `synthesize.metrics.characters`) and tell me
   what that cost at my current rate, and whether my prices still make sense.
5. **Rot.** Anything in `STATUS.md` still marked unverified, or in `RISKS.md`
   whose mitigation has not actually been done.
6. **Disk.** Any `work/` folders for delivered orders that could be cleaned up,
   and any orders past my retention period that I should `purge`.

Finish with **the three things I should do this week**, in order, most important
first. Be blunt. If the honest answer is "you have not done a real order yet and
everything else is procrastination", say that.

---
