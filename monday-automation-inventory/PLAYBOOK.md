# PLAYBOOK: from nothing to submitted, the way it worked for Watchdog

Watchdog took four days (25–28 Sep 2026), most of them lost to the traps in
`LESSONS.md`. This is the same path with the detours removed. Every step
happened on Watchdog. Where this app is simpler (no OAuth, no email, no cron),
the step says so.

The Developer Center shows in Turkish on Samet's account. Its left menu, as
seen on 28 Sep:
- Genel ayarlar
- Oluştur: Özellikler · oAuth & İzinler · Webhook · Uygulama Başlangıç Süreci
- monday Üzerinde Barındır
- Yönet: Uygulama Sürümleri · İşbirlikçiler
- Dağıt: Uygulamayı Yükle · Uygulamayı paylaş · Pazar yerine gönderin
- Analiz: Yüklemeler

---

## 1. Create the app (Samet, 5 min)

1. Developer Center → create a new app with the chosen name.
2. Write the **App ID** and the **Client ID** into `README.md`. Both are
   public.
3. **Do not copy** the Client Secret or the Signing Secret anywhere except the
   monday code secrets form (step 3).
4. oAuth & İzinler: leave **"New OAuth Flow" off**.
5. Scopes: only what the code reads, and nothing that writes.
   - UNKNOWN: which scope `board_automations` needs. Samet's playground run
     used his personal token. Watchdog's inventory tab, which would have
     tested it with app scopes, was never deployed. Start with `boards:read`
     and prove it in step 6.
   - UNKNOWN: the scope of the run-statistics queries. Gate 0 item 4 answers
     it.

## 2. First deploy, to get a Live URL (Samet, PowerShell)

```
cd C:\Users\sametatesen2\boxdrank
git pull
cd monday-automation-inventory
npm install
npm test
npm run check:deploy
mapps code:push -s -f -a <APP_ID>
```

`check:deploy` does locally what monday code does on push: it validates the
runtime pin, builds, and boots the server with no settings. If it fails, do
not push.

- `-a` names the app. Without it the CLI may offer a different app first:
  Watchdog's first push went to the wrong app this way.
- `-f` is needed when the version is already live.
- `-s` runs monday's security scan. It must report 0 findings.
- Then Uygulama Sürümleri → promote the version to live. **The Live URL
  (`live1-service-…monday.app`) exists only after a promotion.** Write it
  into `README.md`.
- `https://<LIVE_URL>/health` must answer. The app starts in setup mode
  without secrets, and `/health` names what is missing, never the values.

## 3. Settings (Samet; the secret never goes through chat)

1. The Live URL, as an environment variable. It is not a secret:
   ```
   mapps code:env -i <APP_ID> -m set -k APP_BASE_URL -v https://<LIVE_URL>
   ```
   `code:env` takes the app as `-i`, not `-a`.
2. monday Üzerinde Barındır → Secrets → add `MONDAY_SIGNING_SECRET`.
   - Copy the value from Genel ayarlar → Signing Secret **with your own
     hands**.
   - This app needs no Client Secret: there is no OAuth and no lifecycle
     webhook.
3. **Redeploy** with the same `mapps code:push` line. Settings are read only
   when the server starts.
4. `https://<LIVE_URL>/health` must now answer
   `{"ok":true,"billing":"off","sidekick":"on"}`.
   - Before step 3 it answers 503 and names what is missing.
   - It never shows a value.

## 4. Features, on a new draft (Samet or Claude-in-Chrome)

A live version is locked. Uygulama Sürümleri → new version (draft). Then
Özellikler → create:

**a) Object**, and **Board view** ("Pano Görünümleri")
- Create both. They show the same page.
  - The Object sits in the workspace's left menu, not on a board. That is
    where a list of the whole account belongs.
  - FACT (`apps/docs/custom-objects`): users add it with "Add item to
    workspace (+)" → Apps.
- Deployment for each: **Harici barındırma** (external hosting).
- URL for each: `https://<LIVE_URL>/view/`.

**b) Automation block** (the Sidekick tool's action)
- Name: `Find automations`. Type **Action**, **not async**.
- Input fields. The keys must match `src/server/app-server.js` exactly.
  - Text, key `search`, title "Search", optional, main field.
    Placeholder: "Words to look for, or empty for all".
  - Text, key `board_name`, title "Board name", optional.
    Placeholder: "Leave empty to search every board".
- Output fields.
  - Text: `summary`.
  - Number: `match_count`.
  - Number: `total_count`.
  - Number: `checked_boards`.
- **Execution URL**: `https://<LIVE_URL>/monday/sidekick/find`.
- **Turn on both switches**: Workflow Builder **and** "Otomasyon
  Oluşturucu'da kullanılabilir hale getir" (Automation Builder).
  - On Watchdog v3 only the first was on. The block could not be found in the
    automation builder, so it could not be tested, and a whole extra version
    (v4) was needed.

**c) Sidekick tool**
- Title: `<APP NAME>: find automations`.
- Description, written **for the AI**:
  > Lists and searches the automations on every board the user can see,
  > newer and older kinds, with whether each is on or off and any warning
  > monday shows on it. Use when the user asks which automations exist, where
  > an automation is, which automations do something (for example "post to
  > Slack" or "move items"), or which are switched off. Inputs: search words
  > (optional) and a board name (optional). Returns: a summary listing each
  > matching automation with its board and state, and counts.
- Attach the block from b).

Then push code to the draft (`mapps code:push -s -a <APP_ID>` goes to the
draft when one exists) and **promote the draft**. After promoting, check
`/health` on the Live URL.

## 5. Install it on Samet's own account

1. Uygulamayı paylaş → accept the Developer Terms → publish.
2. Copy the share link:
   `https://auth.monday.com/oauth2/authorize?client_id=<CLIENT_ID>&response_type=install`.
3. Open it, approve, and check Developer Center → it should say
   "Uygulama yüklendi".
   - Watchdog once looked installed and was not. Check this; do not assume it.

## 6. Test live, before any listing work

- **Object**: in the workspace's left menu, **+** → Apps → the app. Then do
  the same checks as for the board view.
- **Board view**: add it to a board through the Apps menu.
  - It shows the list.
  - The legacy automation "When Status changes to Bitir move item to Group
    Title" appears, marked as the older type.
  - Switch monday between light, dark and night: the view follows.
- **Action block**: on a test board, create the automation "When an item is
  created → <block>".
  1. Create an item.
  2. Check Run history for "Success".
  3. Check monday Üzerinde Barındır → Günlükler for the log line.
  4. **Delete the test automation**: Otomatikleştir → ⋯ → Sil.
- **Sidekick chat**: needs AI credits on the account, which Samet's account
  does not have (28 Sep). Say it is untested; do not claim it works.
- **Unsigned request** to the Execution URL must get 401:
  `curl -X POST https://<LIVE_URL>/monday/sidekick/find` from anywhere.

## 7. Website and legal (Claude writes, Samet pushes)

1. Add the app to `APPS` in `atesensoftware-site/build.mjs`.
2. Write `PRIVACY_POLICY.md` and `TERMS_OF_SERVICE.md`. **Check every sentence
   against the code.**
3. Rebuild the site and commit `public/`. Netlify deploys on push at 15
   credits, only because the site changed.
4. Check afterwards:
   - `https://atesensoftware.com/<slug>/privacy/` and `/terms/` load.
   - `https://atesensoftware.com/monday-app-association.json` lists the new
     client id next to Watchdog's.

## 8. Listing material (Claude)

- `LISTING.md`: the fields and limits in `SUBMISSION-CHECKLIST.md`.
- Images and video: adapt Watchdog's `scripts/make-assets.js` and
  `make-video.js`. Rendered from the real view on invented demo data; say
  "invented" in the docs.
- How-to page: served by the app at `/view/how-to.html`.

## 9. Security evidence (Samet or Claude-in-Chrome, 10 min)

- SSL Labs on the new Live URL. Expected A+, HSTS 180 days set by monday's
  edge. Use `…&hideResults=on`.
- Palo Alto URL filtering (`urlfiltering.paloaltonetworks.com/query/`) on the
  Live URL. Expected Low-Risk.
- Write both into `SECURITY-ANSWERS.md`, dated.

## 10. Submission form (Claude prepares, Samet submits)

1. Claude writes `SUBMISSION.md`: every field, in the form's order, from
   repository text only. A missing answer is marked MISSING, never invented.
2. Samet or Claude-in-Chrome fills it in.
   - **Fill the AI fields by hand.** On 27 Sep the Chrome agent picked "AI
     capabilities: Yes" twice and the tab froze both times. Cause UNKNOWN.
3. Samet only:
   - SLA ("two business day response time" to user questions)
   - Marketplace Listing Terms
   - signature
   - Submit
4. Uploads come from `listing/`: 4 gallery images, app icon, app card,
   developer icon, video.
5. Afterwards: expect the "We received your monday apps marketplace
   submission" email, then the review-board invitation at
   `sametatesen2@gmail.com`.
6. Pricing: once the Pricing & Plans tab appears, submit the pricing version.

---

## Delegating browser steps: the prompt shape that worked

Steps 4, 5, 9 and 10 can go to the Claude-in-Chrome side panel or ChatGPT's
agent. The prompt that set up Watchdog's Sidekick tool in one go (27 Sep) had
this shape:

```
Samet adına monday Developer Center'da "<APP NAME>" (App ID <ID>) uygulamasında şunu yap. Tek rapor ver.

KURALLAR: Şifre/2FA sorulursa dur ve sor. Hiçbir gizli değeri (Client Secret,
Signing Secret, API token vb.) açma, kopyalama, gösterme. "Regenerate" basma.
<Promote edilecekse açıkça yaz; edilmeyecekse: Hiçbir sürümü live'a PROMOTE ETME.>
Ödeme yapma. Formları ben söylemeden gönderme.

1) <Adım: tam menü yolu, her alanın tam değeri, her anahtarın açık/kapalı durumu>
2) ...

Bir alan tipi ya da ayar talimattakiyle birebir yoksa en yakınını seç ve rapora yaz.
RAPOR: her adım yapıldı/engellendi, oluşturulanların adları, sürüm numaraları, ekranda görünen hata metinleri kelimesi kelimesine.
```

What made it work:
- Every field value written out in full.
- Every switch named with its state.
- One report at the end.
- Permission to pick the closest option, and to say so.

What went wrong without it:
- Agents stopped at unexpected screens.
- A Client Secret was saved from the wrong clipboard content. It was caught and
  fixed, but only because the report said so.
