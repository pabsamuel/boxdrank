# Deploy: the prompts and commands, in order

Automation Inventory's `DEPLOY-PROMPTS.md`, which took that app from nothing
to live in one day (28 Sep 2026), adapted:
- **Chrome** blocks go to the Claude-in-Chrome side panel.
- **PowerShell** blocks are for Samet.
- **Samet only** steps involve a secret.

Run them in order and paste each report back before the next step. Do
`PLAYGROUND.md` first, or alongside step 1: if an assumption is wrong, the
code changes before the first deploy.

What differs from Inventory: three scopes instead of one, and the action
block's fields.

---

## 1. Create the app (Chrome)

```
Samet adına monday Developer Center'da (profil resmi → Developers) yeni bir uygulama oluştur. Tek rapor ver.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret, SMTP şifresi) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme. Mevcut "Automation Watchdog" ve "Automation Inventory" uygulamalarına DOKUNMA.

1) "Create app" ile yeni uygulama oluştur. Ad: Unanswered Updates. Uygulama slug'ı sorulursa (değiştirilemez): unanswered-updates
2) Genel ayarlar (Basic information): kısa açıklama "Item updates nobody has answered, across every board". App ID ve Client ID'yi rapora yaz (bunlar gizli değil). Client Secret ve Signing Secret alanlarını AÇMA.
3) oAuth & İzinler (OAuth & Permissions):
   - "New OAuth Flow" anahtarı KAPALI kalsın; açıksa dokunma, rapora yaz.
   - Scopes: SADECE şu üçü işaretli olsun: boards:read, updates:read, users:read. Başka hiçbir scope seçme. Kaydet.
   - Redirect URL ekleme (bu uygulamada OAuth yok).
4) Uygulama Sürümleri (App versions): kaç sürüm var, numaraları ve durumları (Draft/Live) neler, rapora yaz. Hiçbirini promote ETME.
5) Özellik (Features) EKLEME; o sonraki adımda.

RAPOR: App ID, Client ID, oluşturulan sürüm numarası ve durumu, seçili scope'lar, "New OAuth Flow" durumu, ekranda görünen hata metinleri kelimesi kelimesine.
```

After the report, Claude writes the App ID and Client ID into `README.md`
and into the commands below.

## 2. First deploy (PowerShell)

Replace `<APP_ID>` with the App ID from step 1.

```
cd C:\Users\sametatesen2\boxdrank
git pull
cd monday-unanswered-updates
npm install
npm test
npm run check:deploy
mapps code:push -s -a <APP_ID>
```

- If it says "The latest app version is live…", add `-f`.
- If `npm test` or `check:deploy` fails, **stop** and paste the output.
- If the security scan reports anything, paste the report file:
  `Get-Content security-scan-*.json`.

## 3. Promote v1 and get the Live URL (Chrome)

```
monday Developer Center → "Unanswered Updates" → Uygulama Sürümleri. Tek rapor ver.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret, SMTP şifresi) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme. Diğer uygulamalara DOKUNMA.

1) Draft durumundaki ilk sürümü (v1) "Promote to live" ile canlıya al.
2) "monday Üzerinde Barındır" (monday code) sayfasını aç ve "Live URL"i rapora yaz (https://live1-service-....monday.app gibi bir adres).
3) Aynı sayfada son deployment'ın durumunu yaz.

RAPOR: promote edilen sürüm numarası, Live URL, deployment durumu.
```

## 4. Settings (Samet only, then PowerShell)

1. **Samet only, no agent:** Developer Center → Unanswered Updates → monday
   Üzerinde Barındır → Gizli değerler (Secrets).
   - Add the key `MONDAY_SIGNING_SECRET`.
   - The value is Genel ayarlar → Signing Secret, copied with your own hands.
   - Paste it nowhere else: not in chat, not in ChatGPT, not in Chrome.
2. PowerShell. Replace `<APP_ID>` and `<LIVE_URL>`:

```
cd C:\Users\sametatesen2\boxdrank\monday-unanswered-updates
mapps code:env -i <APP_ID> -m set -k APP_BASE_URL -v https://<LIVE_URL>
mapps code:push -s -f -a <APP_ID>
```

Then open `https://<LIVE_URL>/health` in the browser. It must read
`{"ok":true,"billing":"off","sidekick":"on"}`. Paste what it says.

## 5. Features on a new draft (Chrome)

Claude fills in `<LIVE_URL>` before this is pasted.

```
monday Developer Center → "Unanswered Updates". Tek rapor ver.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret, SMTP şifresi) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme (bu talimattaki "Kaydet"ler hariç). Automation Watchdog ve Automation Inventory'ye DOKUNMA.

1) Uygulama Sürümleri → yeni sürüm (draft) oluştur. Numarasını yaz. Aşağıdakileri bu draft'ta yap.
2) Özellikler → Create feature → "Object" (Custom object):
   - Ad: Unanswered Updates
   - Deployment: Harici barındırma (external hosting / custom URL)
   - URL: https://<LIVE_URL>/view/
   - Kaydet.
3) Özellikler → Create feature → "Board view" (Pano Görünümü):
   - Ad: Unanswered Updates
   - Deployment: Harici barındırma, URL: https://<LIVE_URL>/view/
   - Kaydet.
4) Özellikler → Create feature → "Automation block" (Otomasyon bloğu):
   - Block name: Find unanswered updates
   - Description: Finds item updates nobody has answered on the boards the user can see, from the last 30 days, with each one's text, author, age, item and board.
   - Type: Action, Async KAPALI
   - Input fields:
     • Text — key: scope — title: Whose updates — placeholder: mine, mentions or all — optional — main field
     • Number — key: days — title: No answer for at least (days) — placeholder: 2 — optional (Number tipi girdi yoksa Text seç ve rapora yaz)
     • Text — key: board_name — title: Board name — placeholder: Leave empty for every board — optional
   - Output fields:
     • Text — key: summary — title: Summary
     • Number — key: unanswered_count — title: Unanswered updates
     • Number — key: checked_updates — title: Updates checked
   - Execution URL: https://<LIVE_URL>/monday/sidekick/unanswered
   - İKİ anahtar da AÇIK olsun: "Workflow Builder" VE "Otomasyon Oluşturucu'da kullanılabilir hale getir" (Automation Builder). İkisini de kontrol edip rapora yaz.
   - Kaydet.
5) Özellikler → Create feature → "Sidekick tool":
   - Title: Unanswered Updates: find unanswered updates
   - Description: Finds item updates that nobody has answered, across every board the user can see, from the last 30 days. An update counts as answered when someone other than its author replied to it or posted a newer update on the same item. Use when the user asks which of their updates or questions got no answer, which updates mentioning them are still unanswered, or which questions on a board are still open. Inputs: scope ("mine" for updates the user wrote, "mentions" for updates that @mention the user, "all" for everyone's; default mine), days (no answer for at least this many days; default 2) and a board name (optional). Returns: a summary listing each unanswered update with its text, author, age, item and board, and counts.
   - Automation block: "Find unanswered updates" seç. Kaydet.
6) Draft'ı canlıya ALMA. Önce kod bu draft'a yüklenecek (Samet PowerShell'den yapacak).

Bir alan tipi ya da ayar talimattakiyle birebir yoksa en yakınını seç ve rapora yaz.
RAPOR: her adım yapıldı/engellendi, draft numarası, oluşturulan 4 özelliğin adları, "days" alanının tipi (Number ya da Text), bloğun iki anahtarının durumu, hata metinleri kelimesi kelimesine.
```

### 5b. Code onto the draft, then promote (Samet)

A new draft is a separate version. Push the code to it before promoting, so
the version that goes live carries the code (the Watchdog v2 lesson).

```
cd C:\Users\sametatesen2\boxdrank\monday-unanswered-updates
mapps code:push -s -a <APP_ID>
```

Then Developer Center → Unanswered Updates → Uygulama Sürümleri → the new
draft → **Promote to live** (Tanıt). After that, `https://<LIVE_URL>/health`
must still read `{"ok":true,"billing":"off","sidekick":"on"}`.

## 6. Install and test live (Chrome)

Uses the "UU test" items from `PLAYGROUND.md`. If they do not exist yet, the
agent creates "UU test 1" with its @mention update in step 2.

```
monday'de "Unanswered Updates"i kur ve test et. Tek rapor ver.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret, SMTP şifresi) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme. Değişiklikleri YALNIZCA "Automation Actor Test" board'unda yap. Hiçbir şeyi kalıcı silme. Diğer uygulamalara DOKUNMA.

1) Developer Center → Unanswered Updates → Uygulamayı paylaş (Share): gerekiyorsa Developer Terms'i kabul et ve yayınla. Paylaşım linkini yaz (https://auth.monday.com/oauth2/authorize?client_id=...&response_type=install). Linki aç, izin ekranında istenen izinleri kelimesi kelimesine yaz, onayla.
2) "Automation Actor Test" board'unda "UU test 1" item'ı yoksa oluştur ve Güncellemeler'e "@" ile kendi adını (Samet) seçip " UU mention test" yazan bir güncelleme ekle. Cevap YAZMA.
3) Object: sol menüde "+" → Uygulamalar (Apps) → Unanswered Updates'i ekle ve aç. Hoş geldin sayfasında "Show unanswered updates"a bas. Rapora yaz:
   - üstteki notu ("Read from monday just now: … updates …") kelimesi kelimesine,
   - üç düğmenin sayıları (Mine, Mentioning me, All),
   - hata/uyarı varsa kelimesi kelimesine.
   Ekran görüntüsü al.
4) Yaş filtresini "Any age" yap. Mine'da "UU mention test" görünüyor mu? Mentioning me'de görünüyor mu? Satırda "mentions you" yazıyor mu? Satırdaki "Reply ↗"a bas: item kartı Güncellemeler sekmesinde açıldı mı? Kartı kapat (cevap yazma). "Open item in a new tab ↗"a bas: yeni sekmede item açıldı mı?
5) PLAYGROUND.md'deki otomasyonun yazdığı "UU automation test" güncellemesi listede görünüyor mu (All, Any age)? Görünüyorsa kimin adıyla?
6) Aynı uygulamayı "Automation Actor Test" board'una Board view olarak ekle; aynı liste çıkıyor mu?
7) monday temasını karanlık yap (profil → tema), görünüm karanlığa geçiyor mu? Sonra eski temaya geri al.
8) "Automation Actor Test" board'unda yeni otomasyon: "When an item is created" → aksiyon listesinde "Find unanswered updates" bloğunu seç (alanlar boş). Kaydet, bir item oluştur ("UU test 3"). Otomasyonun çalışma geçmişinde (Run history) sonucu yaz (Success/Failed, süre). Developer Center → monday Üzerinde Barındır → Günlükler (Logs): "sidekick unanswered for account" satırını kelimesi kelimesine yaz.
9) TEMİZLİK: 8. adımdaki otomasyonu KAPAT (switch off). SİLME; Samet silecek.

RAPOR: her adımın sonucu, ekran görüntülerinin adları, hata metinleri kelimesi kelimesine.
```

After the report, Claude:
- ticks items 10–14 in `PROGRESS.md`;
- checks from here that `/health` and `/view/how-to.html` answer and that an
  unsigned `POST /monday/sidekick/unanswered` gets 401;
- writes the site-session message (privacy, terms and pricing pages, the
  association file) and the security-evidence prompts, as for Inventory.
