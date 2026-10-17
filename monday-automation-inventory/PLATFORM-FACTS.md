# monday platform facts the new app needs

Carried over from building Automation Watchdog (23–28 Sep 2026). Each fact
names its source. The full record, with quotes, is
`../monday-automation-watchdog/PLATFORM-FACTS.md`; read that file before
relying on anything here that looks thin. Re-check anything older than a month.

## API

| Fact | Source |
|---|---|
| Endpoint `POST https://api.monday.com/v2`; `Authorization` takes the raw token, no `Bearer` | `api-reference/docs/authentication`, 23 Sep |
| An invalid token gets HTTP 401 `NOT_AUTHENTICATED` | Live, 26 Sep |
| The schema of any version can be downloaded without a token: `https://api.monday.com/v2/get_schema?format=sdl&version=2026-10` (`2026-07`, `2026-10`, `2027-01` and `dev` all worked on 28 Sep) | Live, 28 Sep |
| `board_automations` exists in `2026-10`, `2027-01` and `dev` only | Schema, 28 Sep |
| Older ("legacy") automations come only in `legacy_automations`, only for single-board queries, and cannot be toggled, edited or deleted | Schema text and a live playground run, 28 Sep |
| No stable version has an activate/deactivate mutation; `dev` has `activate_live_workflow` / `deactivate_live_workflow` / `change_live_workflow_owner` | Schema, 28 Sep |
| `account_triggers_statistics_by_entity_id`, `trigger_events` and `account_trigger_statistics` exist in `2026-07` | Schema, 28 Sep |
| The board-view SDK takes the API version per call: `monday.api(query, { variables, apiVersion })` | `monday-sdk-js` `client.js`, used by Watchdog |
| The SDK **resolves** on GraphQL errors. Check `response.errors`, or a failure looks like an empty account | Watchdog `src/app/monday-source.js`, `query()` |
| `app_subscription { plan_id is_trial days_left }` returns the account's plan for this app; an empty array means no plan | `api-reference/reference/app-subscription`, 27 Sep |

## Views and features: FACT, read 28 Sep 2026

- `apps/docs/app-features` (updated 30 Apr 2026) lists these feature types:
  - AI assistant and Sidekick tool;
  - on boards: board column extension, board menu features, board view,
    column view, item view;
  - dashboard widgets;
  - doc actions;
  - monday workflows;
  - account settings view and administration view;
  - on workspaces: custom objects and workspace templates.
- **Custom object** ("Object" in the Developer Center, `apps/docs/custom-objects`)
  lives "in the left-pane menu so that users can access the view outside the
  context of a specific dashboard, board, or item". Users add it with "Add
  item to workspace (+)" → Apps.
- **Administration view** (`apps/docs/administration-view`) can be opened by
  account admins only, from Administration → Administration apps.
- `Board.url: String!` exists in the 2026-07 schema.
- `monday.execute("openLinkInTab", { url })` "opens a link in a new tab for
  views" (`apps/docs/mondayexecute`).
- The how-to-use page must include "installation instructions, prerequisite
  information, first-time-use instructions, and images and videos", and must
  not let users navigate to other pages
  (`apps/docs/documentation-and-support`).

## Found in Samet's API playground, 28 Sep 2026 (Gate 0)

- **The playground has no version selector.** The version goes in its
  Headers box: `{"API-Version": "2026-10"}`.
- **`legacy_automations` is an object:** `{ note, automations, recipes, apps }`.
  - Each automation has `id, boardId, userId, recipeId, config, active,
    state, noticeMessage, createdAt, updatedAt`, and **no title**.
  - The recipe's `sentenceParts` plus `config` give the name. Parsed in
    `src/core/legacy.js`, tested with that answer.
  - The `note` asks that they be presented "like any other automation,
    without labels such as legacy or read-only". The app does.
- **Older automations do report their state:** `active: true`,
  `state: "active"`.
- **`account_trigger_statistics`** gives account totals only:
  `{"success":17,"failure":0,"total":17}`. These match the hub's "17
  çalıştırmanın 0 tanesi başarısız oldu".
- **`account_triggers_statistics_by_entity_id(run_status: failure)`** returned
  `{"automation_statistics":{},"workflow_statistics":{}}`, with 0 failures in
  the account.
- **`trigger_events(filters: {automationIds: [1719079685]})`** returned
  `{"triggerEvents":[]}` for an automation whose run history showed "Success"
  that same day. Per-automation run data is not available this way.
- **Board ids do not fit a GraphQL `Int`:** `board_id: 5104569213` in the
  statistics filter failed with "Int cannot represent non 32-bit signed
  integer value". Any `Int` board-id argument is unusable on newer boards.

## monday code (hosting)

- Node 18, 20 and 22. The port comes from `process.env.PORT`.
- Behind Cloudflare and Google:
  - The edge replaces the app's HSTS header with 180 days.
  - **Cloudflare Email Obfuscation** rewrites any full email address in an
    HTML response.
    - On a page with no CSP, the edge adds its own decoding script
      (`/cdn-cgi/scripts/…/email-decode.min.js`), so the address still shows.
      Seen on Watchdog's how-to page, 28 Sep.
    - On a page whose CSP forbids scripts, the address shows as
      "[email protected]". Mask it there.
- **Each deploy gets its own URL**: `<id>-service-<account>-<id>.eu.monday.app`.
  The **Live URL** (`live1-…`) follows whichever version is live.
- **`mapps code:push -a <APP_ID>` deploys to the latest version: the draft,
  if a draft exists.** The Live URL keeps serving the old code until the draft
  is promoted.
- **A live version is locked.** Features, redirect URL and webhooks are
  changed on a new draft, which is then promoted.
- **Secrets are read when the server starts.** A secret added after a deploy
  is unseen until the next deploy.
- Secrets are set in Developer Center → monday code → Secrets. They cannot be
  read back.
- `mapps code:env` takes the app as `-i`; `code:push` takes `-a`. Without it,
  the CLI may pick a different app.
- `.mappsignore` honours only literal, existing paths. Wildcards are silently
  dropped.
- Cron routes (`/mndy-cronjob/*`) answer 403 to the public. The MVP needs none.
- `mapps code:push -s` runs monday's dependency security scan. Watchdog: 0
  findings on every push.

## Sidekick tool (the AI capability)

FACT, `apps/docs/authorization-header`, `integration-authorization`,
`workflows-actions` and `error-handling`, read 28 Sep:

- The Sidekick tool exposes an **action block**; its Run URL is the app's route.
- The request carries a JWT **signed with the Signing Secret**, not the Client
  Secret.
  - Verify `exp`, and verify that `aud` is this route.
  - Watchdog saw `aud` carry the version URL as well as the Live URL. Accept
    both. See `sidekickAudience` in Watchdog's `src/server/app-server.js`.
- The JWT holds a `shortLivedToken`, "valid for five minutes", with the app's
  scopes. Use it for the API calls.
- Inputs arrive in `payload.inboundFieldValues` (or `payload.inputFields`).
- The answer is `200 { outputFields: {...} }`.
- A run URL is retried for 30 minutes "unless 4xx/severity code". A real
  failure is a 4xx with `severityCode: 4000`, never a fake 200.
- **Testing:** sidekick chat needs AI credits on the account, and Samet's
  account has none (28 Sep). The action block can still be tested by putting
  it in a normal board automation. On Watchdog it ran "Success" in 7 s.

## Creating an app: FACT, 28 Sep 2026

- The create-app form asks for an **app slug**: "Önemli: Uygulama slug'ı
  değiştirilemez". monday prefixes it with the account's slug:
  `sametatesen2s-team-company_automation-inventory`.
- The Developer Center's app list is at `/apps/manage`; `/developers/apps`
  is a 404. The reliable way in is profile picture → Geliştiriciler.
- A new app starts with one version, v1, as a draft.

## Adding features: FACT, 28 Sep 2026 (Automation Inventory v2)

- The Developer Center offers a **"Sidekick skill"**, not a "Sidekick tool".
  Watchdog's was the same.
- Automation-block field types have no plain "Text": **"Dize" (String)** and
  **"Numara" (Number)** were used. The block sends them by field key, which is
  what the code reads.
- **Turning on the Automation Builder switch makes a sentence required.**
  Used: "Find automations matching [Search] on board [Board name]".
- **Every feature asks for a permanent slug when first saved:**
  `automation-inventory`, `automation-inventory-board-view`,
  `find-automations`, `find-automations-skill`.
- A board view's wizard asks how to start; "Sıfırdan başla" (from scratch)
  with external hosting works.
- The Live URL serves the live version's code. Code pushed to a draft runs
  only at that draft's own deployment URL until the draft is promoted.
- After v2 was promoted, the version list showed v2 "Canlı" with an "Aktif"
  tag and v1 "Kullanımsız" (unused). v2's own deployment and the Live URL
  both reported the signing secret and `APP_BASE_URL` as set. INFERENCE:
  secrets and env belong to the app, not to a version.

## Installing and testing live: FACT, 28 Sep 2026 (Automation Inventory v2)

From the Claude-in-Chrome report of the step 6 test, with screenshots.
- **Share:** tick the Developer Terms box, then publish. The share status
  becomes "Yayınlandı", for "Tüm hesaplar".
- **The install page** asked for one permission, "Read all of your boards
  data", with "All Workspaces" chosen. It also said, word for word:
  - "This app hasn't been reviewed or approved by monday.com."
  - "Workspace restrictions apply only when the app is used directly. This
    app includes AI Tools, for those tools such restrictions do not apply,
    and access may extend across workspaces based on the relevant user's
    permissions."
- Right after installing, the Developer Center still said "Uygulama yüklü
  değil". A later reload said "Uygulama yüklendi". Reload before concluding
  an install failed.
- **`boards:read` alone is enough for `board_automations`,** older
  automations included, with the page's seamless token and with the action
  block's short-lived token.
- **monday's own titles can lack spaces.** `board_automations.items.title`
  came back as "When an item is created, assignitemcreator asperson" (the
  playground, and the live app), where monday's Automations page shows
  "assign item creator as Person". Another: "…create an update
  onitemwiththis text". The app shows what the API sends.
- **No field holds the readable sentence** (playground, 29 Sep, API
  2026-10, boards 5104569213 and 5104569192 "Spike Source"):
  - `description` is `""` for both automations.
  - `workflow_blocks` is a list of `{ workflowNodeId, blockReferenceId,
    title, inboundFieldsSourceConfig, credentialsSourceConfig,
    nextWorkflowBlocksConfig }`. The titles are readable step names: "When
    item created" → "Assign item creator", and "When item created" →
    "Create update". The order comes from `nextWorkflowBlocksConfig: { type:
    "directMapping", mapping: { nextWorkflowNode: { workflowNodeId } } }`,
    and the trigger is node 1 in both.
  - `workflow_variables` holds what the user configured, including their own
    words: the update text ("Automation note: a new item was created on
    Spike Source. Item: …") and `{ value: "person", title: "Person" }`.
    INFERENCE: the glued title uses `value` ("person") where monday's page
    uses `title` ("Person"), and loses the spaces between terms.
  - Asking for `workflow_variables` would read user content the app does not
    need. The step names in `workflow_blocks` would not, but the privacy
    policy does not list them (`BACKLOG.md`).
- The older automation was named "When Status changes to Bitir move item to
  Group Title", as `src/core/legacy.js` intends.
- **Adding an Object twice** from "+" → Apps puts two objects in the left
  menu. Each is removed on its own.
- **The action block in a board automation:** the sentence reads "Find
  automations matching Search on board Board name". One run: "Success",
  9 s, while the Automations window said "Yapay zeka özellikleri çalışmayı
  durdurdu. Tekrar çalışmaya başlamaları için daha fazla AI kredisi satın
  alın." An action block does not need AI credits.
- The monday code log showed `sidekick find for account 36993937: 6 of 6,
  8 boards`, with payload `{"tag":"automation-inventory"}`.
- **Deleting an automation** asks "Bu otomasyonu silelim mi? Kalıcı olarak
  silinecek ve kurtarmanız mümkün olmayacaktır." The Chrome agent will not
  delete permanently, even when told to. Samet deletes test automations.
- **Once, the page's filters and search stopped answering clicks** in the
  Object; a reload fixed it, and it did not recur. Cause UNKNOWN: nothing in
  the page disables them after loading, and no element covers them.

## The submission form: FACT, 28 Sep 2026 (Automation Inventory)

From the Claude-in-Chrome report.
- Developer Center → Dağıt → Pazar yerine gönderin → Başvuru formu opens the
  form in a frame from another domain, which the agent cannot read. Opened in
  its own tab ("Submit your app to the monday apps marketplace"), it can.
- **Clicking a drop-down can freeze the tab.** Clicking EMEA in "Residential
  region" froze it, and a reload did not help. Choosing with the keyboard
  never froze. INFERENCE: Watchdog's "AI capabilities: Yes" freezes were the
  same thing.
- **Typed text is not kept in the saved draft.** A reopened form offered
  "Kaydedilen değişikliklerle devam mı?", but the text was missing. A frozen
  tab loses everything typed in it.
- Region options: EMEA, Israel, United States, Other.
- Help texts: "Entity Name" asks individual developers for "N/A". Credentials
  asks for "N/A" unless the app is an integration. Short description says
  60 characters at most, while its counter shows /2000.
- Ticking Board View adds a required question: "Are the board and/or item
  view feature/s have been enabled for mobile?" (Yes/No).
- "Value Proposition and Use Cases" is a one-line field: line breaks become
  spaces.
- Choosing "AI capabilities: Yes" with the keyboard did not freeze the tab.
  It then asks, required: "Does you app use AI to generate, process, or
  somehow interact with the user? If so- what LLM model are you utilizing?"
  Options: AI monday Credits, Open AI (GPT), Anthropic (Claude), Google
  Gemini, DeepSeek, Meta (Llama), Grok, and more below.
- After Submit: "Teşekkür ederim! We received your monday apps marketplace
  submission. You will be contacted shortly to start the review process".

## Submission and marketplace

- FACT (form, 28 Sep): only apps with AI capabilities are accepted.
- FACT (Watchdog, 27–28 Sep): the form froze twice when the Chrome agent
  picked "AI capabilities: Yes", with the Sidekick tool already live (v3).
  Samet then filled it in by hand and submitted it on 28 Sep. The cause is
  UNKNOWN. Promote every feature first, then fill in the AI fields by hand.
- FACT (Watchdog, 28 Sep): an automation block is not offered in the
  automation builder unless its "Otomasyon Oluşturucu'da kullanılabilir hale
  getir" switch is on. Only Workflow Builder was on in v3, and it took a new
  version (v4) to fix.
- Install/share link:
  `https://auth.monday.com/oauth2/authorize?client_id=<CLIENT_ID>&response_type=install`.
- Domain proof: `https://atesensoftware.com/monday-app-association.json` lists
  the client ids. Add the new app's id there (`atesensoftware-site/build.mjs`).
- Watchdog's Pricing & Plans tab was not visible after submission (28 Sep).
  INFERENCE: it appears once monday processes the submission. UNKNOWN.

## OAuth (only if the app ever needs a stored token; the MVP does not)

See `../monday-automation-watchdog/PLATFORM-FACTS.md` and `LESSONS.md`:
- the legacy flow;
- `force_install_if_needed=true`;
- monday adds its own `state`;
- keep the "New OAuth Flow" toggle off unless migrating deliberately.
