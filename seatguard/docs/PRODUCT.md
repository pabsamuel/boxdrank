# Why this product

## The market gap, stated precisely

The Atlassian Marketplace carries at least five paid apps doing exactly this job
for Jira — AuditAdmin, User Auditor, Permissions Changes Audit, User Management
and License Optimizer, Application Access and Governance Workflow. They charge
money and they survive.

The monday.com marketplace carries roughly **200 apps in total** and has nothing
in this category.

So the category is *proven to sustain businesses* on the mature marketplace, and
*empty* on the one with a fortieth of the competition. This is not a guess about
whether people pay for permission auditing. They demonstrably do — next door.

## Who buys it

The monday admin or ops lead at an agency or operations team, 30–200 seats.
Large enough that manual auditing is impractical, small enough that nobody has
bought an enterprise SaaS-management platform.

They already hold budget authority, which is why this beats selling to an end
user.

## Why they say yes

Seats bill whether or not anyone logs in. At roughly $16–20/seat/month, finding
eight dormant seats saves $130–160/month — **the app pays for itself before the
first invoice.** Every other finding is a bonus on top of a purchase that has
already justified itself on arithmetic.

That is a much easier sale than "this will make your workflow nicer."

## Pricing

Per **account**, not per seat. The buyer is one ops person; per-seat pricing on
an admin tool is a hard sell and makes the saving argument self-defeating.

| Tier | Price | What's in it |
| --- | --- | --- |
| Free | — | One manual audit, findings visible, subject lists truncated |
| Pro | $39/month | Unlimited audits, full lists, scheduled scans, notifications, CSV export |
| Agency | $99/month | Multiple accounts, white-labelled PDF reports |

**$1,000/month is 26 Pro customers.** Not a viral hit — twenty-six ops people.

Anchor the price against the saving, never against other apps: *"$39 to find
$150."*

## Distribution

1. **Marketplace search** — "audit", "permissions", "seats", "license",
   "governance", "inactive users". Get these in the listing title and
   description.
2. **The monday community forum** — there is an open feature request for
   platform administration and governance tooling. Real people, already asking.
3. **monday consultancies** — the firms publishing blog posts about permission
   limitations (TaskRhino, FlowFam, Simpleday and similar) audit accounts by
   hand today. They are resellers, not competitors.
4. **Direct** — search LinkedIn for "monday.com admin" and "operations manager"
   at agencies. A free audit report is a very strong opening.

## Validation, before more building

**42% of Shopify apps have zero reviews.** They were built for customers who
never existed. Do not join them.

Before the API work, get **ten monday admins to say they would pay**, and take
their emails. The monday community forum governance threads are where they
already are. Ten yeses is your beta list and your first $390/month. Fewer than
ten, and the honest move is to stop.

The demo report (`node src/cli.js fixtures/demo-account.json --html demo.html`)
is the artefact to show them. It exists now, which is the point of having built
the engine before the integration.

## Honest risk

monday could ship native governance tooling and remove the need for this. That
risk is real and unhedgeable. What makes it acceptable: the build is weeks not
months, the three planned products share most of their code, and the domain
knowledge transfers to whatever comes next.

## Sources

- Atlassian governance app landscape (AuditAdmin, User Auditor, License Optimizer)
- monday.com permission layering and audit difficulty (Torii, TaskRhino)
- monday.com marketplace size and revenue-share terms (monday developer changelog)
- Shopify app revenue benchmarks 2026 (Week One Labs)
