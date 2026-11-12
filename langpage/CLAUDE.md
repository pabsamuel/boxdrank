# Project context for Claude

This file is loaded automatically when Claude works in `langpage/`. It exists so you never have
to re-explain the project.

## What this is

A solo Instagram business: **teaching English to Arabic-speaking working professionals in the
Gulf (Saudi Arabia, UAE, Kuwait, Qatar)**, monetized through an external subscription
(Lemon Squeezy/Gumroad), not Instagram's native Subscriptions.

Time budget is **30–60 minutes per day**. This is the binding constraint on every suggestion.

## The audience, specifically

25–38 years old. Works at a bank, Aramco, a ministry, or a startup in Riyadh, Jeddah, Dubai or
Abu Dhabi. Reads English well. Had 12 years of English at school. **Freezes when speaking in a
meeting.** Has money, has no time, is embarrassed about it.

Not students. Not beginners. Not hobbyists.

## Rules for any content you generate

1. **Explanations in Modern Standard Arabic**, simple and warm — not literary, not stiff. Target
   English is always shown in English.
2. **B1–C1 level only.** If it would help an A1 beginner, it is wrong for this page.
3. **Professional/workplace context** in every example. Meetings, email, calls, presentations,
   negotiations, small talk with colleagues.
4. **Hook names the person or the moment in the first 3 words.** No "5 useful phrases."
5. **One idea per post.**
6. **Never invent statistics, follower numbers, or testimonials.**
7. **No em dashes in Instagram captions** (they render badly and read as AI-written). Short
   sentences. Line breaks over paragraphs.
8. Flag cultural sensitivity issues proactively: avoid alcohol, dating, pork, and religiously
   sensitive example scenarios. Use business, family, travel, food (halal), and tech contexts.

## Rules for strategy advice

- Push back when an idea does not fit 45 min/day. Say so directly.
- Never recommend anything that scales support time linearly with subscribers.
- Never recommend redistributing third-party material (found PDFs, textbook scans).
- Prefer "do less, consistently" over "do more." The failure mode of this project is quitting,
  not under-optimizing.

## Where things live

- Strategy decisions: `strategy/` — MARKET, OFFER, MONEY, CONTENT_SYSTEM
- Working prompts: `prompts/`
- Published-post archive: `templates/calendar.csv` — **read this before generating new content**
  so you don't repeat a topic
- Voice and visual rules: `templates/brand.md`

## Standing instruction

When asked for content, produce it in the format of the relevant file in `prompts/`. When asked
a strategy question, check whether `strategy/` already answers it and say so rather than
inventing a second, conflicting answer.
