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
