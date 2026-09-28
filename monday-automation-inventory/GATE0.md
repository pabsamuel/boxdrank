# Gate 0: what Samet runs, and what to paste back

> **Result, 28 Sep 2026: GO.**
> - monday's Autopilot hub does not list every automation with its on/off
>   state, has no automation search, and names older automations with
>   generic words (`COMPETITORS.md`).
> - The run statistics are not usable per automation (`PLATFORM-FACTS.md`),
>   so that feature is dropped.
> - The rest of this file is kept as the record of what was run.

Three checks. Item 2 was done by research on 28 Sep, which leaves about 20
minutes of Samet's time. Each one can stop the project before
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

## 2. Competitors: done by research on 28 Sep (`COMPETITORS.md`)

- No marketplace app among about 980 lists automations across boards.
- The competitor that matters is monday's own **Autopilot hub** (November
  2025). See item 3.
- Optional, if Samet wants a second look: the Claude-in-Chrome prompt below
  searches the marketplace itself.

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

## 3. monday's Autopilot hub (Samet, 10 min)

This is the one check that can still stop the project. monday's help article
(`COMPETITORS.md`) says the hub gives "full visibility into everything that's
automated" across the account. Its documented parts, though, are:
- failures (Health tab);
- usage rankings (Usage tab);
- a search over *workflows* (Workflows tab);
- nothing about a searchable list of every board automation with its on/off
  state.

See it first-hand:
1. In monday, find the **Autopilot hub**. The help article does not say where
   the entry point is (UNKNOWN); try the left menu, the top bar, and
   profile picture → Administration.
2. Open each tab: Health, Usage, Workflows, Connections.
3. Write down:
   - Can you see **every automation** from every board in one list, including
     ones that never failed? Or only failed ones, or only the top ones?
   - Is there a **search box** for automations, and what does it find?
   - Can you filter by **on/off**?
   - Does your older automation on board 5104569213 ("When Status changes to
     Bitir…") appear anywhere?
4. Send screenshots of each tab.

What it decides:
- If the hub already lists and searches every automation with its on/off
  state: **stop**. Nobody pays for what monday gives free.
- If it only shows failures, rankings and workflows: **go**. The gap goes
  into `LISTING.md` word for word.

## The decision

Write it in `DECISIONS.md` once 3 is back (2 is done):
- go or stop;
- and the one sentence of what this does that monday and the competitors do
  not.

This is bound by those results and is not renegotiated afterwards.
