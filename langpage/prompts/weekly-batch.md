# PROMPT: Weekly batch (the main one)

Use once a week. Produces a full week of content in one sitting. Copy everything below the line.

---

Read `langpage/CLAUDE.md`, `langpage/strategy/CONTENT_SYSTEM.md`, `langpage/templates/brand.md`,
and the last 30 rows of `langpage/templates/calendar.csv`.

Produce next week's five posts, one per format (Mon Freeze / Tue Wrong-Right / Wed Carousel /
Thu Reel / Fri Sounds Senior).

**Before writing anything**, do these two steps and show me the output:

1. List the topics already covered in the last 3 weeks, so we don't repeat.
2. Propose 10 candidate topics for next week, each in one line, each tied to a specific moment
   a Gulf professional freezes in English. Wait for me to pick 5 — do not write posts yet.

Then, for each chosen topic, output in this exact structure:

```
=== [DAY] · [FORMAT] ===
HOOK (max 8 words, names the person or the moment):
CAPTION (Arabic explanation + English target phrases, under 120 words,
         short lines, no em dashes):
ON-SCREEN TEXT (for the image/video, max 12 words):
[for carousels: 5 slides, one line each, ranked casual → boardroom]
[for reels: the 3-speed shadowing script with timings]
AUDIO NOTE (what you record, one line):
CTA (the standing CTA from brand.md):
HASHTAGS (3-5, narrow, Arabic + English mixed):
CALENDAR ROW (csv line ready to paste into calendar.csv):
```

Constraints, repeated because they get dropped:
- B1–C1 only. Nothing a beginner would need.
- Every example is workplace context.
- Arabic must be simple Modern Standard Arabic, warm, not literary.
- No alcohol, dating, pork, or religiously sensitive scenarios.
- Flag anything you're unsure about in the Arabic so I verify it before publishing.

End with: the 2 posts you think are weakest and why.
