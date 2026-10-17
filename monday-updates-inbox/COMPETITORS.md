# Competitors and demand

Research of 2 Oct 2026 (one research agent; Help Center pages read through its
public Zendesk JSON API, since the HTML pages answer 403). Each line is FACT
with its source, unless marked otherwise.

## monday's own features: they cover the idea

| Feature | What it does | Source (updated) |
|---|---|---|
| **Update Feed (Inbox)** | Tabs include **"All Updates of Your Account - updates from every board in your account, even if you are not subscribed"**, "I Was Mentioned" and "Bookmarked Updates". "Feed Settings" hides or shows boards. "Your Update Feed (Inbox) will only show updates from the past 6 months." No search box or author/date filter is documented (UNKNOWN) | support.monday.com/hc/en-us/articles/115005309885 (15 Sep 2026) |
| **Search Everything** | "can also help you looking for a specific update within your whole account... select the option 'Updates'... additional filters". Has "Filter by date", saved searches, and a quick search for "all updates you were mentioned and didn't answer to". Covers "Main boards or Private/Shareable boards that you are subscribed to". "comes with the Standard Plan and above" | …/articles/115005334069 (15 Sep 2026) |
| **Board Updates widget** | "see all communication on those boards on a live stream in your Dashboard", newest first. No search or person filter documented | …/articles/360002328919 (18 Aug 2026) |
| **"I Was Mentioned" widget** | "You can display updates you didn't reply to or only replies" | …/articles/360002328879 |
| **Bell notifications** | "Filter by person"; search back 6 months or 1,250 notifications | …/articles/360015535060 |
| **sidekick / AI** | Per-item "Summarize entire thread"; sidekick reads updates; the official agent template "Morning Coffee Summarizer": "Gather urgent updates and mentions across your boards, delivered every day" | …/articles/26701503726610 (22 Sep 2026); monday.com/w/ai-templates/ai-agents/morning-coffee-summarizer |

**Seen on Samet's account, 2 Oct 2026** (Turkish interface, Claude-in-Chrome,
nothing clicked): the Inbox tabs are "Tüm Güncellemeler", "Bahsedilmeler",
"Yer imlerine eklendi", "Tüm hesaplar" and "Planlandı" (tagged "Yeni").
INFERENCE: "Tüm hesaplar" is the Turkish label of "All Updates of Your
Account". The other tabs match the help article one for one, and the article
also mentions the Scheduled tab.

Gaps that are documented:
- The feed shows 6 months only.
- The Activity Log "does not track any updates".
- Excel export is per board, and "if you have Subitems on your board, their
  updates will not be exported".
- The API's account search covers "items, boards, documents, and
  workspaces", not updates.

## Marketplace

monday's `robots.txt` blocks automated agents from `/marketplace/listing/`
and from search URLs. So no install counts, ratings or current prices are
reported, and the in-marketplace search was not run.

No direct, account-wide searchable updates inbox was found. The closest:
- **Search in Updates** (LeanyLabs): searches within one item.
- **Conversations** (Omnitas): updates from linked items, in one item view.
- **Board Email Reports** (Stiltsoft): emailed XLS reports of item updates by
  person, mention, attachment or latest, configured per board.
- **RecapIQ**: a weekly AI recap by email. Unverified, from search snippets
  only.

## Demand

Not researched. The demand search was stopped on 2 Oct once check 2 had
decided the gate, because no demand could reverse a NO-GO (`GATE0.md`).
Redo it for whichever backlog idea gets a gate.
