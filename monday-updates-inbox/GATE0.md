# Gate 0: kill checks for Updates Inbox

> **Result: PENDING** (started 2 Oct 2026).

Four checks. Any one of them can stop the project before a line of app code
is written. Automation Inventory went from GO to submitted in one day because
the gate came first and the code was mostly reused (`DECISIONS.md`).

## Decision rules, fixed before the results (never renegotiated after)

**NO-GO** if any of these holds:
- monday's own Inbox, or another monday feature, already gives one
  searchable, filterable list of all updates across boards.
- A marketplace app already does it, works, and is maintained (listing
  updated or reviewed in the last 12 months).
- The API cannot list updates across the account for the user who opens the
  app, or does so only within limits that make the list useless for a normal
  account (for example, only the last few days).

**GO** needs all of these:
- The API check passes.
- No working equivalent, native or marketplace.
- Demand from at least three distinct people besides Patrick, in public
  threads, any date. The more recent, the better.

## 1. API: can the app list every update? (Samet, playground, 10 min)

What is already known (FACT, `PLATFORM-FACTS.md`, 2 Oct 2026):
- The root `updates` query "returns all updates across an account", newest
  first, 100 per page at most, with `from_date` and `to_date`.
- It needs the `updates:read` scope.

What only a live run shows:
- what comes back;
- how far back it goes;
- whether the nested fields (item, board, replies) work at the root;
- how long a page takes.

Open monday → profile picture → Geliştiriciler → **API playground**. The
playground has no version selector: put `{"API-Version": "2026-07"}` in its
**Headers** box. Run each query, then paste back the full answer. Do not
paste a token; the playground does not show one.

Every field below was checked against the live `2026-07` schema on 2 Oct
2026.

```graphql
query {
  updates(limit: 10, from_date: "2026-09-01", to_date: "2026-10-02") {
    id
    created_at
    text_body
    creator { id name }
    item { id name url board { id name } }
    replies { id created_at text_body creator { name } }
    viewers { user_id }
  }
}
```

```graphql
query {
  updates(limit: 5, page: 1) {
    id
    created_at
    item { board { name } }
  }
}
```

The second query has no dates, so it shows the newest updates in the account.

```graphql
query {
  updates(limit: 100, page: 1, from_date: "2025-01-01", to_date: "2026-10-02") {
    id
    created_at
  }
}
```

The third one shows how many updates come back for a long window: count
them, and note the oldest `created_at`.

### Ready prompt for Claude-in-Chrome (instead of doing it by hand)

```
monday API playground'da üç sorgu çalıştır ve cevapları olduğu gibi rapora yaz. KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret) açma, kopyalama, gösterme. Regenerate'e basma. Şifre veya 2FA isterse dur, bana sor. Ödeme yapma. Formu ben söylemeden gönderme. Mutation ÇALIŞTIRMA; yalnızca aşağıdaki query'ler. Uygulamalara DOKUNMA. Hesap sametatesen2s-team-company olmalı.

1) monday → profil resmi → Geliştiriciler → API playground. Headers kutusuna yaz: {"API-Version": "2026-07"}
2) Sorgu 1:
query { updates(limit: 10, from_date: "2026-09-01", to_date: "2026-10-02") { id created_at text_body creator { id name } item { id name url board { id name } } replies { id created_at text_body creator { name } } viewers { user_id } } }
   Cevabın TAMAMINI kelimesi kelimesine yaz. Sorgunun kaç saniye sürdüğünü de yaz.
3) Sorgu 2:
query { updates(limit: 5, page: 1) { id created_at item { board { name } } } }
   Cevabı tamamen yaz.
4) Sorgu 3:
query { updates(limit: 100, page: 1, from_date: "2025-01-01", to_date: "2026-10-02") { id created_at } }
   Cevaptaki güncelleme SAYISINI ve en eski created_at değerini yaz (cevabın tamamını yapıştırmana gerek yok).

RAPOR: üç cevap (üçüncüsü için sayı ve en eski tarih), süreler, hata metinleri kelimesi kelimesine.
```

## 2. monday's own features (research, plus 2 minutes of Samet's eyes)

monday has an **Inbox**, **My Work**, global search and each item's Updates
section. Research on the help centre answers what they do on paper
(`COMPETITORS.md`). Then Samet looks once on his own account, because help
pages lag the product:
- Open the Inbox: can it show **all** updates, or only items you follow?
- Can you search inside it?
- Can you filter by board, person or date?
- Does the global search find a word that appears only inside an update?

## 3. Marketplace (research)

Search the marketplace for updates feeds, hubs, inboxes and exports
(`COMPETITORS.md`).

## 4. Demand (research)

Look for community threads, reviews and workaround tutorials from people
asking for this, with dates and counts only where the page shows them
(`COMPETITORS.md`).
