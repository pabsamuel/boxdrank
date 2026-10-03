# What already exists: monday's own tools and the marketplace

Researched on 28 Sep 2026 by a research agent in this session.

How the sources were read:
- support.monday.com blocks plain fetches, so its articles were read verbatim
  through its public help-center API, which also gives their dates.
- community.monday.com posts were read through its public guest API.
  Old `/t/...` forum links now return 404.
- Quotes are exact. Nothing here was seen in Samet's own account yet; Gate 0
  item 3 is that check.

## 1. monday's own tools

### The Autopilot hub: the one that matters

- Source: https://support.monday.com/hc/en-us/articles/28738092924562-The-Autopilot-hub
  (updated 6 Aug 2026).
- FACT, launched 6 Nov 2025, per https://monday.com/whats-new: "Control
  automations & workflows across your entire account – Get full visibility
  into everything that's automated in your organization with the new
  Autopilot Hub."
- FACT, it is account-wide: "While you can view each individual board's
  automations on the board Automations page, the Autopilot hub is your
  centralized command center…"
- FACT, tabs: "Health tab, Usage tab, Workflows tab, Connections tab".
- FACT, **Health tab**:
  - It exists for "helping you instantly understand which automations are
    running, which are failing, and why".
  - It lists "each automation or workflow and its description, the owner,
    time of last failure, which board it is located on, and an AI-generated
    root cause classification".
  - "You can filter by owner and by specific board as well."
  - The article's screenshot shows a table of *failed runs*, with no search
    box.
- FACT, **search**: the article documents one, in the Workflows tab, to
  "search for workflows within different workspaces in the account". It
  documents no search over board automations.
- NOT DOCUMENTED:
  - an on/off filter for automations (the Usage tab shows a count of "Active
    automations");
  - legacy (older) automations.
- FACT, **access**: "There is no need for specific permission settings to
  access the Autopilot hub", and board permissions are respected. The plans
  that include it are not stated.

### The Autopilot hub, seen first-hand: 28 Sep 2026

FACT, from Samet's account, checked by his Claude-in-Chrome agent with
screenshots:
- **Where:** the robot icon in the top bar, between "monday marketplace" and
  search. Also a board's Automate menu → "Autopilot Hub". No upgrade was
  asked for.
- **Health (Sağlık):** failed runs only. With no failures it said "Tüm ikincil
  otomasyonlar sorunsuz çalışıyor. Bu zaman aralığında başarısız çalıştırma
  yok." Filters: person and board.
- **Usage (Kullanım):**
  - "En iyi automations / iş akışları", tooltip "Kullanılan eylemlere göre en
    iyi automations". This is a ranking by actions used.
  - Columns: Automation / iş akışı, Pano, Sahip, Eylemler. **No on/off
    column.**
  - The "Automations 3" card counts "Bu faturalandırma döneminde çalışan
    automations sayısı": only those that ran this billing period.
- **Workflows (İş akışları):** its search box was disabled on an account with
  no workflows. Connections has a search for integrations only.
- **Search over automations: none. On/off filter: none.**
- **Clicking a row does nothing**: no link to the board, no details.
- **The older automation on board 5104569213** appears in Usage as "When
  status changes to something move item to group". "Bitir" and "Group Title"
  appear nowhere, so it cannot be found by what it actually does.

### Other native places

| Where | What it is | Source |
|---|---|---|
| Autopilot hub → Usage; Administration → Usage Stats | A ranking, not a full list: the top 5 automations, or "the top 50" in a CSV, with board, owner and actions. Admins only; Standard plan and up | support articles 18063790107282 (30 Mar 2026), 360000326059 (16 Jun 2026) |
| Administration → Directory → Automations ownership | Transfers ownership and sets a default owner. Not a list. Admins only | 25116337794322 (13 Apr 2026) |
| Each board's Automations page → Manage | The full list with on/off, **one board at a time**. A third-party guide says it filters by owner, trigger, app and status, and exports to Excel with the state | 15080944734482 (22 Apr 2026); simpledaysolutions.com (modified 11 May 2026) |
| Deactivation warnings | "You will not receive a notification … you can check … by looking at your board's Automation page" | 360010415679 (18 Jun 2026) |

### What this means (INFERENCE)

The Autopilot hub answers "what is failing across the account". As
documented, it does not answer three questions:
- Give me every automation, on or off, searchable, across all boards.
- Which ones are switched off?
- Show me the older ones.

That gap is the pitch, but it is **narrower than Patrick's email made it
sound**: "siloed per board" is only partly true since November 2025.

**Confirmed first-hand on 28 Sep.** The pitch in one sentence: *find any
automation on any board by what it actually does ("Bitir", "Group Title"),
switched on or off, even the ones that never ran. monday's Autopilot hub lists
only failures and the most-used, and names older automations with generic
words.*

## 2. Marketplace competitors

- Method: the third-party directory apps-for-monday.com, which says it lists
  every marketplace app ("Apps 980"). All 979 app pages it links to were
  downloaded and searched for inventory, audit, overview, list, map, search,
  governance and health language about automations. Web searches, including
  `site:monday.com/marketplace/listing`, were run too.
- **Result: no app found that lists, searches, audits or maps automations
  across boards.**
- Near misses, none of which is an inventory. Install counts are
  apps-for-monday.com's, not monday's; ratings and prices were not visible.

| App | Developer | What it does | Installs |
|---|---|---|---|
| Workspace Admin Toolkit | Satisfaction Drivers | "Bulk board operations made simple" | 8 |
| Admin Pro | Ified Inc | "Simplify account and team administration" | 13 |
| Super Admin | Boost Apps | "Enhance admin oversight with board creation control" | 81 |
| AuditSentry SIEM | UserSentry | "Real-time security dashboards for your monday.com workspace" | 42 |
| Automation Scheduler | CarbonApps | "Run board-wide, filtered automations on a defined schedule" | 34 |

- The directory is third party, so an app it misses would be missed here too.
  Samet's own marketplace search (the prompt in `GATE0.md`) is the check on
  that. It is optional now.

## 3. People asking for it

| Who, when | What they wrote | Link |
|---|---|---|
| Mike Randall, 23 Jun 2025 | "I have 512 automations assigned to my user … across hundreds of different boards… Is there a way to view all automations … and view (and update) their activation status?" | community.monday.com/ask-the-com/post/bulk-editing-activating-automations-gmxvM5pjmy04hKD |
| Brian Bates, 23 Jan 2026 | "There is some automation triggering a field on a board for us … It is not coming from any active automations currently displayed. Where else can I look to find it" | community.monday.com/ask-the-com/post/can-t-find-an-automation-that-is-driving-a-field-incorrectly-2bUndII6bQRxv4q |
| Franck de Luca, 27 Apr 2026 | Asked for exact-string search on a board's automations: "I have to screen 15-20 mixed up automations." | community.monday.com/feature-requests/post/automation-board-search-improvements-NCankSVSUHRwuAP |
| Danni Heron, 20 Jan 2026 | "…some kind of search function that includes the 'when this date is reached' prompt…" | community.monday.com/ask-the-com/post/update-multiple-similar-automations-in-one-go-hDXLoZdHnLHbCBn |
| Morgan Matthews, 24 Jul 2026 | The automations CSV "only includes: ID Sentence Description App names Owner State Updated at." | community.monday.com/feature-requests/post/export-more-columns-to-csv-in-automations-and-workflows-lists-O6InBj7SizoKrNL |

Old forum threads with titles like "Detailed report of all Automations across
all account boards (Like doing an inventory)" still show up in search, but
their content could not be read: the pages now return 404.

## Risks (INFERENCE)

1. **monday builds it.** The Autopilot hub is less than a year old and
   growing. Since July 2026 monday's own agent tools can "Create, read,
   delete, and disable automations" (whats-new, 9 Jul 2026). A searchable
   list in the hub would end this app. There is no date for that, and no sign
   of one.
2. **Legacy coverage is "best-effort".** monday's list tool warns "Some legacy
   automations may not appear in the results". The listing must not promise
   every older automation.
   - FACT: one was returned on Samet's test board.
