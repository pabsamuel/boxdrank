# HomeSizer

Static site of home-equipment sizing calculators. Python + Jinja2, no npm, no
framework, no build toolchain. `dist/` is plain HTML that deploys anywhere free.

```bash
python3 build.py            # build into dist/
python3 build.py --serve    # build, then http://localhost:8000
node scripts/test_engines.js  # check the calculator arithmetic
```

Only dependency is Jinja2 (`pip install jinja2`).

## What's here

Five calculators, chosen because each one is worth more as an interactive tool
than as a paragraph — multi-input, multi-step, or visual. That is the whole
selection criterion, and it is deliberate: single-formula calculators
("lumens = area × footcandles") get answered above the fold by AI and never
earn a click.

| Page | Why it survives being a tool rather than a sentence |
|---|---|
| `/what-size-generator-do-i-need/` | 30-appliance picker; sums running watts + largest single surge |
| `/mini-split-sizing-calculator/` | Seven inputs, climate zone, and rounds to the *nearest* real size — not up |
| `/recessed-lighting-layout-calculator/` | Draws a scale SVG of the ceiling grid |
| `/what-size-air-purifier-do-i-need/` | Volume → ACH → CADR, plus the buy-one-size-up correction |
| `/what-size-water-heater-do-i-need/` | First hour rating, with fuel-dependent recovery and inlet temperature |

Plus `/guides/` for spec tables (the pages that carry the affiliate revenue)
and `/about/` for author identity.

## Adding a calculator

Drop a JSON file in `data/calculators/`, add an engine function in
`static/calc.js` keyed by its `engine` field, add a test in
`scripts/test_engines.js`. The form controls are generated from the JSON —
`number`, `select` (options can carry numeric hints as `data-*`), `checkbox`,
plus two special blocks, `appliance_groups` and `usage_items`.

## Adding a buying guide

Drop a JSON file in `data/roundups/`. Every product row has a `verified` flag.
The build prints a warning listing unverified rows and the page renders a
visible "do not publish" banner until they are checked. **The seed file is all
placeholders — real model names, specs and prices have to be entered by hand
from the manufacturer's data.** The monthly re-check and the visible
`verified_on` date are the thing competitors and language models do not have;
they are the asset, not a chore.

## Before launch

- [ ] Fill in `data/site.json`: `base_url`, `author`, `author_bio`, `amazon_tag`, `adsense_client`
- [ ] Replace every `CHANGE ME`, including the contact line in `templates/about.html`
- [ ] Replace the placeholder products with verified data; set `verified: true` and `verified_on`
- [ ] Put a real name and a real photo on `/about/`
- [ ] Register the domain, deploy `dist/`, submit `sitemap.xml` in Search Console

## Deploy

`dist/` is static. Cloudflare Pages (free): connect the repo, build command
`pip install jinja2 && python3 build.py`, output directory `dist`. Netlify and
GitHub Pages work the same way. No server, no database, no runtime cost.

## Operating rules

These are the part that decides whether the site works. The code is the easy half.

1. **Three pages a week. Never more.** A previous site in this family was
   killed by publishing 300 pages in a month, which reads as scaled content
   abuse whether or not the pages were any good. Steady beats fast, and there
   is no version of this where a burst is worth it.
2. **Every page carries something that can't be generated** — a working
   calculator, a spec checked this month, a real photo, a date that is true.
3. **Half the effort goes to distribution, not pages.** Google will take
   4–6 months if it comes at all. Pinterest (the reference charts), YouTube
   Shorts (45-second screen recordings of each calculator), and genuine Reddit
   answers are what carry the first six months.
4. **Commercial intent pays; informational intent is being eaten.** The
   calculators are top of funnel. The spec tables are the business.
5. **Kill criteria, decided now:** under ~3k sessions/month by month five,
   stop and reuse the engine on another niche. Write the date down somewhere
   you will actually see it.

## Honest expectations

Most new content sites make close to nothing, and AI Overviews have made
informational traffic materially worse since 2024. The format here is chosen to
be the most defensible version of the idea — tools over posts, fresh data over
evergreen prose, commercial over informational, off-Google distribution — but
that is a bet, not a guarantee. Total cost to find out is a domain and some
weekends. Size the expectation to match.
