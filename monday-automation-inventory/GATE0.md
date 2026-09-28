# Gate 0: what Samet runs, and what to paste back

Three checks, about 30 minutes in total. Each one can stop the project before
the listing and submission work, which is where the time goes. The code is
already written; see `DECISIONS.md` for why the gate now sits before the
listing instead of before the build.

## 1. Run statistics: API playground (Samet, 10 min)

Open monday → profile picture → Developers → **API playground**. In the
playground's version selector, choose **2026-07**. Run each query and paste
back the full answer. Do not paste your token; the playground does not show
it.

Every field below was checked against the public `2026-07` schema on 28 Sep
2026.

```graphql
query {
  account_trigger_statistics {
    id
    success
    failure
    total
  }
}
```

```graphql
query {
  account_triggers_statistics_by_entity_id(run_status: failure) {
    id
    automation_statistics
    workflow_statistics
  }
}
```

```graphql
query {
  account_triggers_statistics_by_entity_id(run_status: success, filters: { board_id: 5104569213 }) {
    automation_statistics
  }
}
```

The schema types `board_id` here as `Int`. A GraphQL `Int` is 32-bit, and
5104569213 is larger than that, so this one may fail with a type error. If it
does, paste the error: that answers the question too, because it would mean
per-board statistics cannot be asked for on newer boards.

For the next one, put the id of your **newer** automation on board 5104569213
into `automationIds`. The id is in the answer of the `board_automations` query
you ran earlier with version `2026-10`. Do not use 186000595: that is the older
one.

```graphql
query {
  trigger_events(filters: { automationIds: [PUT_ID_HERE] }) {
    triggerEvents {
      triggerUuid
      eventState
      errorReason
      triggerStartedAt
      entityKind
      hostType
    }
  }
}
```

What the answers decide:
- Does `automation_statistics` give counts per automation id?
- Over what period?
- Are older automations in it?
- Does it answer at all, or say something like "permission denied"?

If it works, each row in the list can show "ran 214 times, 12 failed" (item 13
in `PROGRESS.md`). If it does not, the list stays as it is. Either way the
project goes on; this check changes a feature, not the go/stop decision.

## 2. Competitors: Claude-in-Chrome prompt (delegate, 15 min)

```
monday.com marketplace'te (https://monday.com/marketplace) rakip araştırması yap. Sadece oku: hiçbir uygulamayı YÜKLEME, hiçbir şey satın alma, hiçbir forma bir şey gönderme. Şifre/2FA sorulursa dur ve bana sor.

Şu kelimeleri tek tek ara: automation, automations, automation manager, automation overview, automation audit, automation center, automations list, workflow map, inventory.

Her aramada çıkan ilk 20 sonuç için bir tabloya yaz:
- uygulama adı
- geliştirici
- ekranda görünen kurulum sayısı (aynen)
- puan ve yorum sayısı (aynen; yoksa "yok")
- fiyat (aynen)
- kartta yazan tek satırlık açıklama

Sonra, hesabın BÜTÜN board'larındaki otomasyonları tek yerde listeleyen, arayan ya da haritasını çıkaran uygulamaların listing sayfasını aç. Her biri için şunları yaz:
- ne yaptığı (listing'den kelimesi kelimesine 2-3 cümle)
- otomasyonları açıp kapatabiliyor mu
- eski tip (legacy) otomasyonları gösteriyor mu
- son güncelleme tarihi (görünüyorsa)

Hiçbir sayıyı tahmin etme; ekranda yoksa "görünmüyor" yaz.
RAPOR: tablo, en yakın 3 rakibin detayı, ve ekran görüntüsü aldıysan adları.
```

Paste the report back. What it decides:
- If an app already does this with installs and reviews, the question becomes
  what this app does better, answered in one sentence, or stop.
- If nothing close exists, go on.

## 3. monday's own automations page (Samet, 5 min)

Patrick called its search "weak"; see it first-hand.

1. In monday, open any board → **Otomatikleştir** (Automate).
2. Look for a page that lists automations across **every** board, not just
   this one. It may be called "Automation Center", "Otomasyon Merkezi" or
   something like "Hesap otomasyonları"; UNKNOWN where exactly it is. Also look
   under the profile menu → Administration.
3. If it exists, write down:
   - Does it show every board's automations at once?
   - Is there a search box, and what does it search: names only, or board
     names too?
   - Can you filter by on/off?
   - Does it show your older automation on board 5104569213 ("When Status
     changes to Bitir…")?
4. Send two screenshots: the page, and a search on it.

What it decides:
- If monday's own page already does all of this well, stop: nobody pays for
  what is free.
- If it lacks a cross-board list, search, filters or the older automations,
  the gap is the pitch, and it goes into `LISTING.md` word for word.

## The decision

Write it in `DECISIONS.md` once 2 and 3 are back:
- go or stop;
- and the one sentence of what this does that monday and the competitors do
  not.

This is bound by those results and is not renegotiated afterwards.
