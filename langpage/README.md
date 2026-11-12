# LangPage — English for Gulf Arabic speakers

A one-person Instagram language-teaching business: daily free posts → email/Broadcast list →
paid tier with async speaking practice and original ebooks.

**Budget: 30–60 minutes per day.** Every system in this folder is designed to fit inside that.
If something here takes longer than that, it is wrong and should be cut.

---

## The verdict (read this first)

**Feasible: yes.** Realistic outcome at 12 months of consistent daily posting is
**$800–$3,000/month**, not life-changing money, and it is a *job*, not passive income.
Anyone promising more is selling a course about selling courses.

**Three things in the original plan had to change:**

| Original idea | Problem | What we do instead |
|---|---|---|
| "Practice in my DMs" | 1:1 DM correction is ~4 min/person/day. 100 subs = 6.5 h/day. It collapses exactly when it succeeds. | Capped seats + async voice-note feedback with a 24h SLA + one weekly group live. See `strategy/OFFER.md`. |
| "Give them ebooks I find" | Redistributing found PDFs is copyright infringement, gets the account reported, and refunds spike. | Ebooks are auto-compiled from your own post archive. Zero extra writing. See `prompts/ebook-compile.md`. |
| "Open subscriptions on Instagram" | IG Subscriptions needs 10k followers, a supported country, and a waitlist you don't control. | External checkout from day one (Gumroad / Lemon Squeezy). IG Subs is a *later addition*, never the plan. See `strategy/MONEY.md`. |

**The single biggest risk is not strategy — it is you stopping in week 6.** Everything here is
built to make day 40 as cheap to execute as day 2.

---

## The decision: what language, for whom

**Teach English. Explain in Arabic. Target working professionals in Saudi Arabia and the UAE.**

Not Spanish (saturated to the point of invisibility), not Turkish (weak currency, low USD ARPU),
not Japanese (best payers, but the hardest content bar to clear).

Full scoring and the runner-ups are in **`strategy/MARKET.md`**. Read it before you disagree.

---

## Folder map

```
langpage/
├── README.md               ← you are here
├── CLAUDE.md               ← auto-loaded context; makes Claude useful in this folder
├── HOW_TO_USE_CLAUDE.md    ← how to actually drive Claude for this project
├── strategy/
│   ├── MARKET.md           ← why this language pair, with scoring
│   ├── OFFER.md            ← tiers, pricing, and the DM-scaling math
│   ├── MONEY.md            ← payment rails, IG eligibility, taxes
│   └── CONTENT_SYSTEM.md   ← the 5 post formats and the weekly batch
├── prompts/                ← copy-paste prompts, the actual working tools
├── ops/
│   ├── 90_DAY_PLAN.md      ← week by week, with kill criteria
│   └── METRICS.md          ← the 6 numbers that matter, and the ones that don't
└── templates/
    ├── brand.md            ← voice, visual rules, bio
    └── calendar.csv        ← content calendar
```

## Start here, in this order

1. Read `strategy/MARKET.md` — confirm or reject the market call.
2. Read `strategy/OFFER.md` — this is the business; the posts are just marketing for it.
3. Fill in `templates/brand.md` — 20 minutes, once.
4. Run `prompts/weekly-batch.md` — produces 7 posts in one sitting.
5. Follow `ops/90_DAY_PLAN.md`.

Do not build anything else until you have posted 30 days straight.
