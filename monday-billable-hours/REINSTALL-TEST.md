# Watchdog: uninstall and reinstall test

`PROGRESS.md` section 5: "Uninstall and reinstall verified; two accounts
sharing one email verified". The first try, 28 Sep, found two bugs:
- an install from monday's own link was refused for carrying no state;
- authorizing did not install the app.

Both were fixed with tests on 27–28 Sep (6e0f2b6, 7e9c06b, f2ed874), before
Samet's three pushes of 28 Sep. INFERENCE from the times: the fixes are live.
This test proves it. Samet approved uninstalling on his own account (1 Oct).

What the server logs, word for word (`src/server/app-server.js`):
- `installed for account <id>`
- `uninstalled for account <id>`
- `uninstall ignored for account <id>: its token still works`
- `install refused for account <id>: already set up by another user`
- `install failed: …`

The pages the install can end on:
- "Automation Watchdog is installed"
- "Alerts are already set up for this account"
- "Installation was not completed"

Samet's account id is 36993937.

## Prompt (Claude-in-Chrome)

```
Automation Watchdog için kaldır-yeniden kur testi yap. Tek rapor ver. Samet bu test için Automation Watchdog'un KENDİ HESABINDAN kaldırılmasına açıkça izin verdi; bu bir silme değil, hemen yeniden kurulacak.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. YENİ monday hesabı AÇMA. Automation Inventory'ye, otomasyonlara ve board'lara DOKUNMA (sadece 5. adımdaki görünüm ekleme serbest). Açılır listelerde fareyle tıklamak sekmeyi dondurabiliyor; mümkünse klavyeyle seç. Her adımda ekran görüntüsü al.

0) ÖNCE OKU, DEĞİŞTİRME: Developer Center → Automation Watchdog → Web kancaları (Webhooks) sekmesi. Bir URL tanımlı mı, tanımlıysa tam adresini yaz (adres gizli değil). Sonra monday Üzerinde Barındır → Günlükler (Logs): en son 5 satırı saatleriyle yaz.
1) KALDIR: monday'de profil resmi → Yönetim (Administration) → Uygulamalar (Apps) → Automation Watchdog → Kaldır (Uninstall). Bu menüyü bulamazsan sol menüdeki Uygulamalar/Marketplace → Yüklü uygulamalar → Automation Watchdog → Kaldır. Bir sebep sorarsa "Testing" seç ya da yaz. Onay penceresindeki metni kelimesi kelimesine yaz.
2) 2 dakika bekle. Developer Center → Automation Watchdog → monday Üzerinde Barındır → Günlükler: "uninstalled for account 36993937" ya da "uninstall ignored ..." satırı var mı? Yeni satırların hepsini saatleriyle kelimesi kelimesine yaz.
3) YENİDEN KUR: Bu linki aç: https://auth.monday.com/oauth2/authorize?client_id=9fcd68cae356c7fed3eacf09a0f9df81&response_type=install
   Kur (Install) de. Hangi izinleri istediğini yaz. Kurulumdan sonra açılan sayfanın başlığını ve metnini kelimesi kelimesine yaz ("Automation Watchdog is installed", "Alerts are already set up for this account" ya da "Installation was not completed" bekleniyor).
4) Günlükler: "installed for account 36993937" satırı geldi mi? Yeni satırları kelimesi kelimesine yaz.
5) "Automation Actor Test" board'unda Automation Watchdog görünüm sekmesi duruyor mu? Durmuyorsa "+" (Görünüm ekle) → Uygulamalar → Automation Watchdog ile ekle. Sayfanın en üstündeki durum şeridinin metnini kelimesi kelimesine yaz. "Set up email alerts" linki görünüyorsa ona bas, monday'in izin sayfasında onayla, açılan sayfanın başlığını ve metnini yaz, sonra board view'ı yenileyip şeridi tekrar yaz.
6) İKİNCİ HESAP (YENİ HESAP AÇMADAN): Profil resmi menüsünde "Hesap değiştir" (Switch account) gibi bir seçenek var mı? Varsa listede kaç hesap var, adları ne, yaz. HİÇBİRİNE GEÇME, burada dur.

RAPOR: her adımın sonucu, bütün sayfa başlıkları/metinleri ve log satırları kelimesi kelimesine, ekran görüntülerinin adları. Bir adım beklenenden farklı giderse orada dur ve olanı yaz.
```

## After the report

- Both log lines present, and the page "Automation Watchdog is installed":
  the uninstall/reinstall half is verified.
- No `uninstalled …` line: either the Webhooks tab has no URL (step 0), or
  monday sent nothing. A reinstall by the same user still works
  (`sameInstaller`), but a stale record would stay. Fix on a new version.
- The two-account half needs a second monday account under the same email.
  If step 6 lists none, creating one is Samet's call (a free account, his
  name on monday's terms).

## Run 1, 1 Oct 2026: result

- **Uninstall works end to end.** The Webhooks tab has
  `https://live1-service-36993937-ca48573e.eu.monday.app/monday/lifecycle`.
  - Path: Profil → Yönetim → Uygulamalar → "…" → Uninstall. Mouse clicks did
    not open the menu; Enter did.
  - Then: a reason screen with no "Testing" option ("Başka bir şey" plus
    text), and a confirmation box.
  - monday then showed "Automation Watchdog başarıyla kaldırıldı" at
    ~11:47:40.
  - The log at 11:47:42: `uninstalled for account 36993937`.
- **The install link installs, and nothing more.** monday's install page
  asked for four permissions:
  - "Read your profile information"
  - "Read all of your boards data"
  - "Read the profile information of the users in your account"
  - "Read general information about your account"

  After Install, monday went to its own `…/admin/installedApps/manage`. The
  app is listed there, installed "Oct 1, 2026".
- No `installed for …` line. That is by design, and my prompt expected the
  wrong thing:
  - The server ignores every lifecycle event except `uninstall`
    (`lifecycle()` answers 200 and returns).
  - The token comes only from "Set up email alerts" in the board view, the
    app's own OAuth.
- **Until that step, the account has no alerts.** The uninstall deleted its
  record.
- Samet has two accounts under one login: `sametatesen2s-team-company` (id
  36993937) and `sametatesen2s-team-squad`. The two-account half needs no
  new account.

## Prompt, run 2 (Claude-in-Chrome)

```
Automation Watchdog testinin devamı. Tek rapor ver. Samet bu testte iki hesabında da Automation Watchdog kurup kaldırmana açıkça izin verdi.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. YENİ monday hesabı AÇMA. Automation Inventory'ye ve otomasyonlara DOKUNMA. Açılır menülerde fare çalışmazsa Enter/klavye kullan. Her adımda ekran görüntüsü al. Bir adım beklenenden farklı giderse orada dur ve olanı yaz.

A) sametatesen2s-team-company hesabında:
1) "Automation Actor Test" board'unu aç. Automation Watchdog görünüm sekmesi yoksa "+" (Görünüm ekle) → Uygulamalar → Automation Watchdog ile ekle. Board yüklenmezse F5, sonra Ctrl+Shift+R dene.
2) En üstteki şeridin metnini kelimesi kelimesine yaz ("Email alerts are not set up for this account" bekleniyor).
3) "Set up email alerts" linkine bas. monday'in izin sayfası açılırsa istenen izinleri yaz ve onayla. Açılan sayfanın başlığını ve metnini kelimesi kelimesine yaz ("Automation Watchdog is installed" bekleniyor).
4) Developer Center → Automation Watchdog → monday Üzerinde Barındır → Günlükler (Son 30 dakika): "installed for account 36993937" satırı geldi mi? Yeni satırları saatleriyle kelimesi kelimesine yaz.
5) Board view'ı yenile; şeridin yeni metnini yaz.

B) İkinci hesap, sametatesen2s-team-squad:
6) Profil resmi → "Hesapları değiştir" → sametatesen2s-team-squad'a geç.
7) Bu linki aç: https://auth.monday.com/oauth2/authorize?client_id=9fcd68cae356c7fed3eacf09a0f9df81&response_type=install — sayfanın üstünde seçili hesabın sametatesen2s-team-squad olduğunu kontrol et (değilse orada değiştir), Install'a bas. Sonrasında açılan sayfanın adresini ve metnini yaz.
8) Bu hesapta bir board aç (varsa ilkini). Hiç board yoksa dur ve yaz. Board'a Automation Watchdog görünümünü ekle, şeridi yaz, "Set up email alerts"a bas, onayla, açılan sayfanın başlığını ve metnini yaz.
9) Günlükler: yeni "installed for account ..." satırını yaz. Hesap numarası 36993937'den FARKLI olmalı.
10) TEMİZLİK, aynı hesapta (team-squad): Profil → Yönetim → Uygulamalar → Automation Watchdog → "…" → Uninstall ("Başka bir şey" → "Testing"). 1 dakika sonra Günlükler: "uninstalled for account <team-squad numarası>" satırını yaz.
11) sametatesen2s-team-company'ye geri geç. "Automation Actor Test" board'undaki Automation Watchdog şeridinin metnini tekrar yaz. 5. adımdakiyle aynı olmalı; team-squad'dan kaldırmak bu hesabı etkilememeli.

RAPOR: her adımın sonucu, bütün sayfa metinleri ve log satırları kelimesi kelimesine, iki hesabın numaraları, ekran görüntülerinin adları.
```

What run 2 proves:
- A: the reinstall really completes, and alerts are back on Samet's account.
- B: two accounts under one email are two separate installs; removing one
  leaves the other alone.

## Run 2, 1 Oct 2026: stopped at A2, and a real bug

- The Watchdog view on "Automation Actor Test" showed only "Nothing repeats
  often enough to watch yet…": no run strip and no "Set up email alerts" link.
- **Cause (FACT, `src/app/main.js`):** `render()` returned before
  `renderRunStatus()` whenever there were no results.
  - Since 541cb77 (28 Sep, "board view ignores people"), Samet's account has
    none: its four patterns were people.
  - So the strip, and the only setup link, were hidden. This hits **any new
    account, a reviewer's included**: it could never set up alerts.
- The Chrome agent's guess, that the new code was not deployed, was wrong:
  - v4 is live, with every Watchdog code commit (the last was 28 Sep 02:08
    UTC, before Samet's pushes).
  - The 30 Sep 18:10 log lines are a server restart, not a deploy.
- **Fix:** the empty-results branch draws the run strip first.
  - `test/browser/verify-empty-view.mjs` checks it in a fake monday with an
    empty account. 3 of its checks fail on the old code; all pass on the new.
  - `npm test`: 266/266. `check:deploy`: ready.
- **Live, 2 Oct 2026.** Samet pushed it to v4. Checked from here: the Live
  URL's `/view/main.js` hashes like this build (`9f4aec…`), not the old one
  (`c0a10b…`). `/health`: mail verified, sidekick on. Next: run 2 again from
  A1.

