# Competitors and demand

Research of 8 Oct 2026 (one research agent). Help Center pages were read
through monday's public Zendesk API; community threads through the forum's
public guest-read API, with no login or posting. Each line is FACT with its
source unless marked otherwise.

## 1. Native monday features: none lists no-reply updates for any author

| Feature | What it does about replies | Source (updated) |
|---|---|---|
| Update Feed (Inbox) | Tabs for all updates, mentions, the whole account and bookmarks; Feed Settings hide or show boards. **No reply filter.** 6 months only | support article 115005309885 (15 Sep 2026) |
| Search Everything | "Quick Searches also allow you to see all updates you were mentioned and didn't answer to": **mentions of you only**. Other filters are not listed (UNKNOWN). Main boards, or private/shareable boards you're subscribed to | 115005334069 (15 Sep 2026) |
| "I Was Mentioned" widget | "You can display updates you didn't reply to": **mentions of you only**. Its settings are buggy: monday support said on 6 Feb 2026 "in the backlog… we don't have an ETA" | 360002328879 (18 Aug 2026); community thread |
| Board Updates widget | A multi-board stream, newest first; no other settings documented | 360002328919 (18 Aug 2026) |
| Updates section | "Whenever an update is grey, it means that no one has posted any new updates for more than 7 days": per item, fixed 7 days, does not look at replies | 115005900249 (6 Oct 2026) |
| Last Updated column | "not when an update is posted in the updates section" | 360000504840 (22 Jul 2026) |
| Automations | No "no reply in X days" trigger documented. A community reply (7 Jul 2025): "native automations don't track replies" | community |
| monday Service SLA | "Only available on monday service"; driven by statuses, and replies by email. Does not read Work Management item updates | 30628237276690 (24 Aug 2026) |

## 2. monday's AI: close, but none does this out of the box

Official agent templates (monday.com/w/ai-templates/ai-agents/…):
- **@Mentions Digest:** "finds items and updates where you're @mentioned and
  still owe a response". Mentions of you.
- **Ticket Follow-Up Agent:** "tracks every ticket you have open across your
  connected support and ticketing boards… checks whether you've already
  posted a reply". Your own tickets.
- **Dispute Follow-Up Agent:** "checks whether the last message has gone
  unanswered past your chosen window". Disputed invoices only.
- **Morning Coffee Summarizer, Executive Assistant, Nudger, SLA Monitor:**
  digests, overdue tasks, and status timestamps. Not replies.
- 82 template pages were scanned; none lists all unreplied updates across
  boards.
- sidekick "Read[s] … updates" and can "suggest follow-ups"; its prompt
  library has no unanswered-updates prompt. INFERENCE: a custom agent or a
  prompt could do it, and monday could ship this exact template. That is the
  main substitution risk.

## 3. Marketplace: none found

- **SLA** (evolu.software) and **Time in Status** (SaaSJet): status-based
  SLAs.
- **Stale & SLA** (TrueCrane): "Days since last activity", and still "in
  review". Not reply-aware.
- **Board Email Reports** (Stiltsoft): "Last Updates" reports, with no
  reply filter.
- None of the 256 developer-community "Share your app" posts is about
  unanswered updates.
- UNKNOWN residue: robots.txt blocks `/marketplace/listing/`, so the
  marketplace could not be crawled exhaustively.

## 4. Demand: 7 distinct people, low volume, about mentions

| Date | Thread | Votes / replies | Quote |
|---|---|---|---|
| 27 Jul 2026 | FR "Track all outgoing @mentions for Follow-up" (Sarah Winston) | +1: 1; 1 reply ("This would be an amazing feature!") | "I have to open hundreds of project updates to find unanswered questions." |
| 16 Jun 2026 | FR "@ Where I Mentioned Other People" (Meghann Ferguson) | 0; 2 replies, both supportive | "check if they saw the tag, answered, or did the action without responding." |
| 26 Jun 2025 | Ask "Automation for 'No Response'…" | 0; 1 reply | "has not responded to my message within 24 to 48 hours… send them a notification/reminder" |
| 29 Jan 2026 | Ask "'I was mentioned' widget settings disabled?" | 0; 4 replies | Wants "Only mentions I didn't reply to" to work |
| 2 Mar 2025 | Ask "I was mentioned Widget" | 1; 1 reply | The "didn't reply" option cannot be selected |

- 5 posters and 2 supporters: **7 distinct people**. Samet's own posts are
  excluded.
- Four older threads exist only as search snippets; their pages are 404
  after the forum moved, so dates and authors are UNKNOWN.
- Related: "comments don't count as activity" (about 5 more people, 1–3
  votes each); "Allow Search Within Updates" (9 upvotes).
- INFERENCE: every request is about **my** mentions, the questions I asked
  or was asked. None asks for a manager's view of every author's unreplied
  updates. Popular feature requests carry 300+ reactions; these carry 0–2.
