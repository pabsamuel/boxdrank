# Live check before release: what only a real account shows

The code is built on the schema and the docs (`PLATFORM-FACTS.md`). Three
things in it are ASSUMPTIONS that only real updates can confirm or refute.
Each is in the code, marked, with a test that pins the assumed shape.

| # | Assumption | Where in the code | If it is wrong |
|---|---|---|---|
| 1 | A user mention in `body` is a link with `data-mention-type="User"` and `data-mention-id="<id>"`, or a link to `…monday.com/users/<id>`, with "@Name" as its text | `parseMentions`, `src/core/unanswered.js` | "Mentioning me" stays empty, and rows say no names. Fix the parser to the real shape |
| 2 | An update written by an automation has no person as `creator_id` / `creator` | `normaliseUpdate`, `findUnanswered` | Automation updates show up as unanswered, under the automation owner's name. Find what marks them and filter on it |
| 3 | `item { board }` and `creator` resolve at the root `updates` query | `UPDATES_QUERY`, `src/app/monday-source.js` | Rows lose their item, board or author. Fetch those separately |

Also measured: how long a page of 100 takes, and its complexity cost.

## Prompt for Claude-in-Chrome

Replace nothing: the agent reads today's date itself.

```
monday'de küçük test verisi oluştur, sonra API playground'da sorgu çalıştır. Tek rapor ver.

KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret, SMTP şifresi) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme. Playground'da mutation ÇALIŞTIRMA; yalnızca aşağıdaki query'ler. Automation Watchdog ve Automation Inventory uygulamalarına DOKUNMA. Hesap: sametatesen2s-team-company. Değişiklikleri YALNIZCA "Automation Actor Test" board'unda yap; başka board'a, otomasyona, item'a dokunma. Hiçbir şeyi kalıcı silme.

A) Test verisi ("Automation Actor Test" board'u)
1) Yeni item: "UU test 1". Item'ı aç → Güncellemeler (Updates) → yeni güncelleme: "@" yaz, listeden kendi adını (Samet) seç, ardından " UU mention test" yaz ve gönder. Cevap (reply) YAZMA.
2) Otomatikleştir (Automate) → yeni otomasyon oluştur: tetikleyici "When an item is created", eylem "create an update" (güncelleme oluştur). Bu eylem listede YOKSA bu adımı atla ve "create an update eylemi yok" yaz. VARSA güncelleme metni "UU automation test" olsun, kaydet; sonra yeni item oluştur: "UU test 2"; item'da "UU automation test" güncellemesinin çıktığını kontrol et; sonra bu otomasyonu KAPAT (switch off). SİLME.

B) Playground: monday → profil resmi → Geliştiriciler (Developers) → API playground. Headers kutusuna yaz: {"API-Version": "2026-10"}
Tarihler: FROM = dünün tarihi, TO = yarının tarihi, ikisi de YYYY-AA-GG biçiminde. FROM30 = 30 gün önceki tarih.
3) Sorgu 1 (FROM ve TO'yu yerine koy):
query { me { id name } complexity { query before after } updates(limit: 10, from_date: "FROM", to_date: "TO") { id created_at creator_id creator { id name } body text_body item { id name url board { id name } } replies { id creator_id created_at } } }
   Çalıştır. Cevabın TAMAMINI kelimesi kelimesine rapora yapıştır, kısaltma (özellikle "body" alanlarını). Kaç saniye sürdüğünü yaz.
4) Sorgu 2 (FROM30 ve TO'yu yerine koy):
query { complexity { query before after } updates(limit: 100, page: 1, from_date: "FROM30", to_date: "TO") { id created_at creator_id } }
   Cevabı YAPIŞTIRMA. Şunları yaz: kaç güncelleme döndü; en eski created_at; creator_id değeri null, boş, 0 ya da eksi olan kaç tane var ve onların id'leri; complexity değerleri; kaç saniye sürdü.

RAPOR: A adımlarının sonucu (her biri yapıldı / yapılamadı ve neden), Sorgu 1'in tam cevabı, Sorgu 2'nin özeti, hata metinleri kelimesi kelimesine.
```

## After the report

Samet, by hand (the agent does not delete permanently): on "Automation Actor
Test", delete the "When an item is created, create an update" automation
(Otomatikleştir → ⋯ → Sil → Kalıcı Olarak Sil). The two "UU test" items can
stay; they are the live test's data.

Claude then:
- writes the real shapes into `PLATFORM-FACTS.md`, marked FACT with the date;
- fixes `parseMentions` and the author check if they differ, with a test on
  the real HTML;
- ticks `PROGRESS.md` item 9.
