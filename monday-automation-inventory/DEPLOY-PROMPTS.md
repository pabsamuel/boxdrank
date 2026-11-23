# Deploy: the prompts and commands, in order

`PLAYBOOK.md` steps 1–6 as ready-to-paste text:
- **Chrome** blocks go to the Claude-in-Chrome side panel.
- **PowerShell** blocks are for Samet.
- **Samet only** steps involve a secret.

Run them in order and paste each report back before the next step.

---

## 1. Create the app (Chrome)

```
Samet adına monday Developer Center'da (profil resmi → Developers) yeni bir uygulama oluştur. Tek rapor ver.

KURALLAR: Şifre/2FA sorulursa dur ve sor. Hiçbir gizli değeri (Client Secret, Signing Secret, API token) açma, kopyalama, gösterme; "Regenerate"e basma. Ödeme yapma. Hiçbir formu ben söylemeden gönderme. Mevcut "Automation Watchdog" uygulamasına DOKUNMA.

1) "Create app" ile yeni uygulama oluştur. Ad: Automation Inventory. Uygulama slug'ı (değiştirilemez): automation-inventory
2) Genel ayarlar (Basic information): kısa açıklama "Every automation on every board, in one searchable list". App ID ve Client ID'yi rapora yaz (bunlar gizli değil). Client Secret ve Signing Secret alanlarını AÇMA.
3) oAuth & İzinler (OAuth & Permissions):
   - "New OAuth Flow" anahtarı KAPALI kalsın; açıksa dokunma, rapora yaz.
   - Scopes: SADECE boards:read işaretli olsun. Başka hiçbir scope seçme. Kaydet.
   - Redirect URL ekleme (bu uygulamada OAuth yok).
4) Uygulama Sürümleri (App versions): kaç sürüm var, numaraları ve durumları (Draft/Live) neler, rapora yaz. Hiçbirini promote ETME.
5) Özellik (Features) EKLEME; o sonraki adımda.

RAPOR: App ID, Client ID, oluşturulan sürüm numarası ve durumu, seçili scope'lar, "New OAuth Flow" durumu, ekranda görünen hata metinleri kelimesi kelimesine.
```

After the report, Claude writes the App ID and Client ID into `README.md`.

## 2. First deploy (PowerShell)

Automation Inventory's App ID is **12255778** (created 28 Sep 2026).

```
cd C:\Users\sametatesen2\boxdrank
git pull
cd monday-automation-inventory
npm install
npm test
npm run check:deploy
mapps code:push -s -a 12255778
```

- If it says "The latest app version is live…", add `-f`.
- If `npm test` or `check:deploy` fails, **stop** and paste the output.
- If the security scan reports anything, paste the report file:
  `Get-Content security-scan-*.json`.

## 3. Promote v1 and get the Live URL (Chrome)

```
monday Developer Center → "Automation Inventory" → Uygulama Sürümleri. Tek rapor ver. Aynı KURALLAR geçerli (gizli değer yok, Regenerate yok, ödeme yok).

1) Draft durumundaki ilk sürümü (v1) "Promote to live" ile canlıya al.
2) "monday Üzerinde Barındır" (monday code) sayfasını aç ve "Live URL"i rapora yaz (https://live1-service-....monday.app gibi bir adres).
3) Aynı sayfada son deployment'ın durumunu yaz.

RAPOR: promote edilen sürüm numarası, Live URL, deployment durumu.
```

## 4. Settings (Samet only, then PowerShell)

1. **Samet only, no agent:** Developer Center → Automation Inventory → monday
   Üzerinde Barındır → Secrets.
   - Add the key `MONDAY_SIGNING_SECRET`.
   - The value is Genel ayarlar → Signing Secret, copied with your own hands.
   - Paste it nowhere else.
2. PowerShell. Replace `<LIVE_URL>`:

```
cd C:\Users\sametatesen2\boxdrank\monday-automation-inventory
mapps code:env -i 12255778 -m set -k APP_BASE_URL -v https://<LIVE_URL>
mapps code:push -s -f -a 12255778
```

Then open `https://<LIVE_URL>/health` in the browser. It must read
`{"ok":true,"billing":"off","sidekick":"on"}`. Paste what it says.

## 5. Features on a new draft (Chrome)

The Live URL is `https://live1-service-36993937-d7d03ea4.eu.monday.app`; it is already filled in below.

```
monday Developer Center → "Automation Inventory". Tek rapor ver. KURALLAR: Şifre/2FA sorulursa dur. Hiçbir gizli değeri açma/kopyalama/gösterme, Regenerate'e basma, ödeme yapma, form gönderme. Automation Watchdog'a DOKUNMA.

1) Uygulama Sürümleri → yeni sürüm (draft) oluştur. Numarasını yaz. Aşağıdakileri bu draft'ta yap.
2) Özellikler → Create feature → "Object" (Custom object):
   - Ad: Automation Inventory
   - Deployment: Harici barındırma (external hosting / custom URL)
   - URL: https://live1-service-36993937-d7d03ea4.eu.monday.app/view/
   - Kaydet.
3) Özellikler → Create feature → "Board view" (Pano Görünümü):
   - Ad: Automation Inventory
   - Deployment: Harici barındırma, URL: https://live1-service-36993937-d7d03ea4.eu.monday.app/view/
   - Kaydet.
4) Özellikler → Create feature → "Automation block" (Otomasyon bloğu):
   - Block name: Find automations
   - Description: Finds automations on the boards the user can see that match some words, with each one's board and on/off state.
   - Type: Action, Async KAPALI
   - Input fields:
     • Text — key: search — title: Search — placeholder: Words to look for, or empty for all — optional — main field
     • Text — key: board_name — title: Board name — placeholder: Leave empty to search every board — optional
   - Output fields:
     • Text — key: summary — title: Summary
     • Number — key: match_count — title: Matching automations
     • Number — key: total_count — title: Automations listed
     • Number — key: checked_boards — title: Boards read
   - Execution URL: https://live1-service-36993937-d7d03ea4.eu.monday.app/monday/sidekick/find
   - İKİ anahtar da AÇIK olsun: "Workflow Builder" VE "Otomasyon Oluşturucu'da kullanılabilir hale getir" (Automation Builder). İkisini de kontrol edip rapora yaz.
   - Kaydet.
5) Özellikler → Create feature → "Sidekick tool":
   - Title: Automation Inventory: find automations
   - Description: Lists and searches the automations on every board the user can see, with whether each is on or off and any warning monday shows on it. Use when the user asks which automations exist, where an automation is, which automations do something (for example "post to Slack" or "move items"), or which are switched off. Inputs: search words (optional) and a board name (optional). Returns: a summary listing each matching automation with its board and state, and counts.
   - Automation block: "Find automations" seç. Kaydet.
6) Draft'ı canlıya ALMA. Önce kod bu draft'a yüklenecek (Samet PowerShell'den yapacak).

Bir alan tipi ya da ayar talimattakiyle birebir yoksa en yakınını seç ve rapora yaz.
RAPOR: her adım yapıldı/engellendi, draft numarası, oluşturulan 4 özelliğin adları, bloğun iki anahtarının durumu, hata metinleri kelimesi kelimesine.
```

### 5b. Code onto the draft, then promote (Samet)

A new draft is a separate version. Push the code to it before promoting, so
the version that goes live carries the code. This is the Watchdog v2 lesson.

```
cd C:\Users\sametatesen2\boxdrank\monday-automation-inventory
mapps code:push -s -a 12255778
```

Then Developer Center → Automation Inventory → Uygulama Sürümleri → the new
draft → **Promote to live** (Tanıt). After that, `https://<LIVE_URL>/health`
must still read `{"ok":true,"billing":"off","sidekick":"on"}`.

## 6. Install and test live (Chrome)

```
monday'de "Automation Inventory"yi kur ve test et. Tek rapor ver. KURALLAR: gizli değer yok, Regenerate yok, ödeme yok. Test için oluşturduğun otomasyonu SONUNDA SİL; başka hiçbir otomasyona, board'a dokunma.

1) Developer Center → Automation Inventory → Uygulamayı paylaş (Share): gerekiyorsa Developer Terms'i kabul et ve yayınla. Paylaşım linkini yaz (https://auth.monday.com/oauth2/authorize?client_id=...&response_type=install). Linki aç, onayla. Developer Center "Uygulama yüklendi" diyor mu, yaz.
2) Object: çalışma alanının sol menüsünde "+" → Uygulamalar (Apps) → Automation Inventory'yi ekle ve aç. "Show my automations"a bas. Ekranı rapora yaz:
   - üstteki 4 sayı,
   - listedeki otomasyonların adları ve On/Off etiketleri,
   - board 5104569213'teki eski otomasyon "When Status changes to Bitir move item to Group Title" olarak görünüyor mu,
   - hata/uyarı varsa kelimesi kelimesine.
   Ekran görüntüsü al.
3) "Switched off" filtresine bas, sonra aramaya "Bitir" yaz; sonuçları yaz. Bir satırdaki "Open board ↗"a bas: yeni sekmede o board açıldı mı?
4) Aynı uygulamayı bir board'a Board view olarak ekle; aynı liste çıkıyor mu?
5) Monday temasını karanlık yap (profil → tema), görünüm karanlığa geçiyor mu? Sonra eski temaya geri al.
6) "Automation Actor Test" board'unda yeni otomasyon: "When an item is created" → aksiyon listesinde "Find automations" bloğunu seç (search boş). Kaydet, bir item oluştur. Otomasyonun çalışma geçmişinde (Run history) sonucu yaz (Success/Failed, süre). Developer Center → monday Üzerinde Barındır → Günlükler (Logs): "sidekick find for account" satırını kelimesi kelimesine yaz.
7) TEMİZLİK: test otomasyonunu SİL (Otomatikleştir → ⋯ → Sil) ve oluşturduğun test item'ını sil.

RAPOR: her adımın sonucu, ekran görüntülerinin adları, hata metinleri kelimesi kelimesine.
```

After step 6, Claude:
- marks items 7 and 18–20 in `PROGRESS.md`;
- checks from here that `https://<LIVE_URL>/health` and `/view/how-to.html` answer and that an unsigned `POST /monday/sidekick/find` gets 401;
- runs the security evidence (SSL Labs, Palo Alto) prompts in `PLAYBOOK.md` step 9.

## 7. After the live test (28 Sep 2026)

Step 6 passed (`PROGRESS.md` item 20). Four things are left.

### 7a. Delete the test automation (Samet only)

The Chrome agent will not delete permanently. The automation is switched off.

On the "Automation Actor Test" board: Otomatikleştir → **⋯** next to "When an
item is created, Find automations…" → Sil → **Kalıcı Olarak Sil**.

The second "Automation Inventory" object in the left menu is harmless. Keep it
or remove it; the app does not care.

### 7b. Push the welcome-page fix (PowerShell)

v2 is live and there is no draft, so the push needs `-f`. It replaces the live
code; the Live URL keeps its address.

```
cd C:\Users\sametatesen2\boxdrank
git pull
cd monday-automation-inventory
npm install
npm test
npm run check:deploy
mapps code:push -s -f -a 12255778
```

Then open `https://live1-service-36993937-d7d03ea4.eu.monday.app/health`. It
must read `{"ok":true,"billing":"off","sidekick":"on"}`.

### 7c. Where monday keeps the readable title (Chrome)

`board_automations` sent "When an item is created, assignitemcreator asperson"
where monday's Automations page shows "assign item creator as Person". The
schema (2026-10, read 28 Sep) has `description: String`, `workflow_blocks:
JSON` and `workflow_variables: JSON` on each automation. This query shows
whether any of them holds the words with their spaces.

```
monday API playground'da iki sorgu çalıştır ve cevapları olduğu gibi rapora yaz. KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme. Mutation ÇALIŞTIRMA; yalnızca aşağıdaki query. Automation Watchdog'a DOKUNMA.

1) monday → profil resmi → Geliştiriciler (Developers) → API playground.
2) Headers kutusuna yaz: {"API-Version": "2026-10"}
3) Sorgu 1:
query { board_automations(board_ids: [5104569213]) { items { id title description workflow_blocks workflow_variables } } }
   Çalıştır. Cevabın TAMAMINI kelimesi kelimesine rapora yapıştır, kısaltma.
4) "Spike Source" board'unu aç; adres çubuğundaki /boards/ sonrasındaki sayıyı yaz. Sorgu 1'i o sayıyla tekrar çalıştır (5104569213 yerine). Cevabı yine tamamen yapıştır.

RAPOR: Spike Source'un board ID'si ve iki cevap, olduğu gibi.
```

### 7d. Security evidence: Palo Alto (Chrome)

SSL Labs is run from Claude's side.

```
Palo Alto URL filtering'de bir adresin kategorisini kontrol et. KURALLAR: Hiçbir gizli değeri açma, kopyalama, gösterme. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Hesap açma. Formu ben söylemeden gönderme (sorgu kutusu hariç).

1) https://urlfiltering.paloaltonetworks.com/query/ aç.
2) Adres: live1-service-36993937-d7d03ea4.eu.monday.app
3) Robot doğrulaması çıkarsa çöz; çözemezsen dur ve bana sor.
4) Sonuçtaki kategori(ler)i ve risk seviyesini kelimesi kelimesine yaz. Ekran görüntüsü al.

RAPOR: kategori, risk seviyesi, tarih, ekran görüntüsünün adı.
```

## 8. The website (message for the site session)

Checked 28 Sep 2026, after the live test: the three pages answer 404, and
`monday-app-association.json` lists only Watchdog's client id.

**That session must run on Samet's computer.** The site repository and
`deploy.ps1` exist only there, and a cloud session cannot reach them: the
first attempt, 28 Sep, stopped for exactly this. Start it from the Claude
desktop app with the computer selected (or "Link to this computer" on the
existing task), or run `claude remote-control` in a terminal inside the
site's folder. Then paste:

```
Automation Inventory canlı ve test edildi (App ID 12255778, client id fb2b51f8128e2fbcc70e02843099902d). Sayfalarını şimdi yayınla:

1) Daha önce hazırladığın automation-inventory zip'indeki içeriği yerel atesensoftware-site reposuna koy: privacy, terms, pricing sayfaları (src/static/automation-inventory/), src/static/assets/automation-inventory.png ve _headers'taki /automation-inventory/* bloğu (Watchdog'unkiyle aynı CSP).
2) monday-app-association.json'a ikinci clientID olarak fb2b51f8128e2fbcc70e02843099902d ekle. Watchdog'unki (9fcd68cae356c7fed3eacf09a0f9df81) kalsın. Ana sayfaya Automation Inventory kartı EKLEME; onay gelince eklenecek.
3) scripts/deploy.ps1 ile yayınla.
4) Kontrol et ve rapor ver:
   - https://atesensoftware.com/automation-inventory/privacy/, /terms/, /pricing/ → 200
   - https://atesensoftware.com/monday-app-association.json → iki clientID
   - Watchdog'un üç sayfası hâlâ 200 ve değişmemiş
   - support@atesensoftware.com yeni sayfalarda düz yazı
5) Yerel repoyu GitHub'a push et (pabsamuel/atesensoftware-site). GitHub'dan otomatik deploy AÇMA.
```

After the report, Claude checks the four URLs from here and marks items 21
and 22.

## 9. The submission form (Chrome fills, Samet finishes and submits)

Do 7d (Palo Alto) first. The prompt below is generated from `SUBMISSION.md`
and `LISTING.md`; if either changes, regenerate it rather than editing it by
hand. The Chrome agent fills every text field and **does not submit**. Samet
then does, by hand, in the same tab:
- "Does your APP contain AI capabilities?" → Yes, and the AI description
  (`SUBMISSION.md`, section 16). On Watchdog the agent's tab froze here twice.
- The uploads from `listing/`: 4 gallery images, app icon, app card,
  developer icon, video.
- SLA, Marketplace Listing Terms, signature, Submit.

```
monday Developer Center'da "Automation Inventory" uygulamasının başvuru formunu (Submit app → Submission form) doldur. Tek rapor ver.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu GÖNDERME (Submit'e BASMA). Sekmeyi kapatma. Automation Watchdog'a DOKUNMA.

ŞUNLARA DOKUNMA, BOŞ BIRAK (Samet elle yapacak):
- "Does your APP contain AI capabilities?" ve AI ile ilgili tüm alanlar (Watchdog'da bu alanda sekme iki kez dondu)
- Görsel/video yüklemeleri (gallery, app icon, app card, developer icon, video)
- SLA, Marketplace Listing Terms onayı, imza (Signature)

Diğer alanları aşağıdaki değerlerle birebir doldur. Seçenekli bir alanda değer birebir yoksa en yakınını seç ve rapora yaz. Formda listede olmayan bir alan varsa boş bırak ve adını rapora yaz.

1) App Name: Automation Inventory
2) Entity: Individual Developer
3) Entity Name: Samet Ateşen
4) Full name: Samet Ateşen
5) Residential region: Türkiye
6) Entity Website: https://atesensoftware.com
7) Technical Point of Contact: Samet Ateşen — sametatesen2@gmail.com
8) Email Addresses of your teammates: (boş bırak)
9) Business Point of Contact - Email: sametatesen2@gmail.com
10) Support Address: support@atesensoftware.com
11) Did you build the app using monday code?: Yes
12) App Short Description: Every automation on every board, in one searchable list
13) App Long Description: AŞAĞIDAKİ UZUN AÇIKLAMA
14) Keywords: automation, automations, automation list, automation search, find automations, automation audit, inventory, admin, workflow, sidekick
15) App Features: Object; Board view; Sidekick tool (with its "Find automations" action block)
17) Value Proposition and Use Cases: AŞAĞIDAKİ METİN (Value Proposition and Use Cases)
18) Feature Names: Automation Inventory (object); Automation Inventory (board view); Automation Inventory: find automations (Sidekick tool); Find automations (action block)
19) Categories: Productivity & efficiency; Reporting & analytics; Project management
20) OAuth Scopes: AŞAĞIDAKİ METİN (OAuth Scopes)
21) Personal Data Use: AŞAĞIDAKİ METİN (Personal Data Use)
22) Privacy Policy: https://atesensoftware.com/automation-inventory/privacy/
23) Terms of Service: https://atesensoftware.com/automation-inventory/terms/
24) Pricing Model: monday's Monetization
25) Link to your Pricing Page: https://atesensoftware.com/automation-inventory/pricing/
31) Installation Link: https://auth.monday.com/oauth2/authorize?client_id=fb2b51f8128e2fbcc70e02843099902d&response_type=install
32) App ID: 12255778
33) How to use Link: https://live1-service-36993937-d7d03ea4.eu.monday.app/view/how-to.html
34) Demo Link: https://live1-service-36993937-d7d03ea4.eu.monday.app/view/
35) Additional Comments: AŞAĞIDAKİ METİN (Additional Comments)
36) Credentials for review purpose: AŞAĞIDAKİ METİN (Credentials for review purpose)
40) How did you hear about our marketplace?: Other
41) Do you have any apps published or under review in our marketplace?: Yes (ayrıca bir metin kutusu çıkarsa: Automation Watchdog, app 12249756, submitted 28 Sep 2026)
42) Are you a monday.com channel partner?: No

--- UZUN AÇIKLAMA (App Long Description), düz metin ---
monday keeps each board's automations on that board's own Automations page. With dozens of boards, finding the one that moves items to Done, or checking which automations are switched off, means opening board after board.

Automation Inventory puts every automation on every board you can see into one list.

What it does
- Lists every automation on the boards you can see, on one page, including ones that have never run
- Shows whether each one is switched on, and the warning monday shows on it, with the ones that need attention first
- Finds an automation by searching its name, its board or its warning
- Filters to the ones switched off, the ones with a warning, or one board
- Opens an automation's board in one click, to switch it on or off there
- Works with sidekick, monday's AI assistant: ask "which of my automations are switched off?" or "which automations post to Slack?" and it answers with each automation's name, board and state
- Sits in your workspace's left menu, or as a view on any board, and follows monday's light, dark and night themes

What it asks for
Read-only access to boards, and nothing else. It never changes a board, an item or an automation, and it stores nothing: the list is read in your browser each time you open it.

What it cannot do
It cannot switch automations on or off itself, because monday's public API does not offer that, so it takes you to the board instead. It shows only the boards you have access to.

--- Value Proposition and Use Cases ---
monday keeps each board's automations on that board's own Automations page. Automation Inventory lists every automation on every board the user can see in one searchable list, with whether each is switched on and the warning monday shows on it, including automations that have never run. Automations set up the older way are named by what they do, using the board's own column, label and group names.

Use cases:
- An admin finds which automation keeps moving items to Done, without opening board after board.
- A team checks which automations are switched off, or carry a warning, across all its boards.
- A consultant taking over an account sees every automation in one place on day one.

--- OAuth Scopes ---
boards:read — the boards the user can see, the automations on them, and, for automations set up the older way, the board's column titles, status labels and group names, to name those automations. Read-only; the app never writes. It has no OAuth install flow and stores no token.

--- Personal Data Use ---
None is stored. The app reads boards and their automations, in the user's browser with their own session, or with the short-lived token monday sends with a sidekick request, and keeps nothing: no database, no tokens, no email addresses. It does not ask for items, column values, updates, files or anyone's name or email. Logs hold only an account id and counts. Full details: https://atesensoftware.com/automation-inventory/privacy/

--- Additional Comments ---
Hosted entirely on monday code, with no storage of any kind. One read-only scope. The page uses seamless authentication. The Sidekick tool's action block verifies monday's signed request with the signing secret, checks expiry and audience, and returns 4xx with severityCode 4000 on failure. Security answers with code references are available on request.

--- Credentials for review purpose ---
No separate credentials are needed: the app uses the reviewer's own monday account. Install it, then open it from the workspace's left menu ("+" → Apps) or add it as a view on any board. It lists every automation on the boards the reviewer can see. The demo link shows the full page on an invented demo account.

RAPOR: doldurulan her alan (numara + ad), boş bırakılanlar, formda gördüğün ama listede olmayan alanlar, karakter sınırı uyarıları ve hata metinleri kelimesi kelimesine. Submit'e basmadığını teyit et.
```
