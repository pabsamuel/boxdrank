# It ran, but it sounds wrong

Use when the job succeeded and the output is not good enough to send.

---

The job finished but I am not happy with it. Help me fix it.

Order ID: `<ORDER ID>`

What is wrong, in my words:

```
<e.g. "it doesn't really sound like her">
<e.g. "the Turkish lines are rushed and run past the end">
<e.g. "line 40 is completely silent">
<e.g. "everything is quieter than the other characters">
```

Please:

1. Read `work/<ORDER ID>/report/qc.md` and the `master` metrics in
   `work/<ORDER ID>/state.json` (fit strategies, median slot error, overflow count).
2. Match what I described to a cause, using `docs/07-QUALITY-BAR.md`.
3. Tell me which of these it is:
   * **fixable for free** — an option change plus `run --from master`
   * **needs re-synthesis** — an option or text change plus `run --from synthesize`,
     and roughly what that costs
   * **needs better input** — the samples are the limit, and I should ask for a
     re-record. If so, draft the message asking for it.
4. Make the change, re-run the cheapest stage that fixes it, and tell me which
   specific lines to listen to in order to check.

If several things are wrong, fix the one with the biggest effect first and say
what you are deliberately leaving alone.

Do not tell me a line is fine if the report says it is not.

---
