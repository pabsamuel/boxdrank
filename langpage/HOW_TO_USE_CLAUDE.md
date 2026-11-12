# How to actually use Claude for this

You said you don't know how to use Claude properly. This file is the answer. It is short on
purpose.

---

## The one idea that matters

**Most people use Claude like a search engine: one question, one answer, start over.**
That is why they get generic output.

Use it like a colleague who already knows the project. The `CLAUDE.md` in this folder is what
makes that possible — it loads automatically, so Claude already knows your audience, your
constraints, and your rules before you type anything. You never re-explain.

So your prompts get to be short:

> Bad: "Write me an Instagram post about English phrases for business meetings, my page teaches
> English to Arabic speakers, make it engaging..."
>
> Good: "Run prompts/daily-post.md for Monday. Topic: interrupting politely in a meeting."

---

## The four things that make output good instead of generic

### 1. Give it the real inputs, not a description of them
Don't say "my posts do okay." Paste the actual numbers from `templates/calendar.csv`.
Don't say "make it sound like me." Fill in `templates/brand.md` once, then say "use brand.md."

### 2. Ask for options, then choose — don't ask for "the best one"
> "Give me 8 hooks for this post. Range from safe to risky. Don't explain them."

You pick. Claude is much better at generating range than at guessing your taste.

### 3. Make it critique before it creates
This is the highest-leverage trick in this whole file:
> "Before you write it: what are the 3 most likely reasons this post flops with a 31-year-old
> Saudi banker? Then write the post avoiding them."

### 4. Iterate in the same conversation
Don't start fresh. "Tighter." "The hook is generic, try 5 more." "Cut it to 40 words."
Three rounds of iteration beats one perfect prompt, every time.

---

## What to use it for, and what not to

| Use it for | Don't use it for |
|---|---|
| Drafting 7 posts in one batch | Replying to your DMs (they're paying for *you*) |
| Rewriting weak hooks 10 ways | Deciding whether to quit |
| Compiling posts into an ebook | Inventing engagement numbers or "trends" |
| Monthly performance analysis | Arabic copy you can't personally verify |
| Arguing against your own bad ideas | Anything where being wrong is expensive and unverifiable |

**The Arabic caveat is serious.** Verify every Arabic sentence before publishing. A grammar
mistake in the explainer language destroys authority instantly with this specific audience.

---

## Your actual weekly rhythm with Claude

**Sunday (2.5 h)** — one conversation:
1. "Read templates/calendar.csv. What have we covered in the last 3 weeks?"
2. "Run prompts/weekly-batch.md for next week."
3. Iterate on the weak ones. Usually 2–3 of the 7 need another pass.
4. "Now run prompts/hook-doctor.md on all 7 hooks."

**Monthly (45 min)** — `prompts/monthly-review.md` with real numbers pasted in.

**Quarterly (1 h)** — `prompts/ebook-compile.md` to turn the archive into the next ebook.

That's it. Three recurring conversations.

---

## Two habits that will save you

1. **Keep the archive current.** `templates/calendar.csv` is what turns Claude from a generic
   writing tool into something that knows your page. Thirty seconds per post.
2. **Tell it when it's wrong.** "That's too beginner." "That hook is a cliché." It adjusts and
   stays adjusted for the rest of the conversation. People who don't push back get mediocre
   output and blame the tool.
