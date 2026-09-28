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

1) "Create app" ile yeni uygulama oluştur. Ad: Automation Inventory
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

Replace `<APP_ID>` with the number from step 1.

```
cd C:\Users\sametatesen2\boxdrank
git pull
cd monday-automation-inventory
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
2. PowerShell. Replace `<APP_ID>` and `<LIVE_URL>`:

```
cd C:\Users\sametatesen2\boxdrank\monday-automation-inventory
mapps code:env -i <APP_ID> -m set -k APP_BASE_URL -v https://<LIVE_URL>
mapps code:push -s -f -a <APP_ID>
```

Then open `https://<LIVE_URL>/health` in the browser. It must read
`{"ok":true,"billing":"off","sidekick":"on"}`. Paste what it says.

## 5. Features on a new draft (Chrome)

Replace `<LIVE_URL>` before pasting.

```
monday Developer Center → "Automation Inventory". Tek rapor ver. KURALLAR: Şifre/2FA sorulursa dur. Hiçbir gizli değeri açma/kopyalama/gösterme, Regenerate'e basma, ödeme yapma, form gönderme. Automation Watchdog'a DOKUNMA.

1) Uygulama Sürümleri → yeni sürüm (draft) oluştur. Numarasını yaz. Aşağıdakileri bu draft'ta yap.
2) Özellikler → Create feature → "Object" (Custom object):
   - Ad: Automation Inventory
   - Deployment: Harici barındırma (external hosting / custom URL)
   - URL: https://<LIVE_URL>/view/
   - Kaydet.
3) Özellikler → Create feature → "Board view" (Pano Görünümü):
   - Ad: Automation Inventory
   - Deployment: Harici barındırma, URL: https://<LIVE_URL>/view/
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
   - Execution URL: https://<LIVE_URL>/monday/sidekick/find
   - İKİ anahtar da AÇIK olsun: "Workflow Builder" VE "Otomasyon Oluşturucu'da kullanılabilir hale getir" (Automation Builder). İkisini de kontrol edip rapora yaz.
   - Kaydet.
5) Özellikler → Create feature → "Sidekick tool":
   - Title: Automation Inventory: find automations
   - Description: Lists and searches the automations on every board the user can see, with whether each is on or off and any warning monday shows on it. Use when the user asks which automations exist, where an automation is, which automations do something (for example "post to Slack" or "move items"), or which are switched off. Inputs: search words (optional) and a board name (optional). Returns: a summary listing each matching automation with its board and state, and counts.
   - Automation block: "Find automations" seç. Kaydet.
6) Bu draft'ı "Promote to live" ile canlıya al.

Bir alan tipi ya da ayar talimattakiyle birebir yoksa en yakınını seç ve rapora yaz.
RAPOR: her adım yapıldı/engellendi, draft numarası, oluşturulan 4 özelliğin adları, bloğun iki anahtarının durumu, hata metinleri kelimesi kelimesine.
```

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
