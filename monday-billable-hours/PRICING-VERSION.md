# Pricing versions: ready for when the Pricing & Plans tab appears

Both apps need one, and both are still waiting for the tab:
- Watchdog: `PROGRESS.md` §5.
- Inventory: `../monday-automation-inventory/PROGRESS.md` item 29.

Neither tab was visible after submission (28 Sep). Everything below can be
pasted the day it appears.

## The rules: FACT, read 4 Oct 2026

Sources:
- `developer.monday.com/apps/docs/submit-your-plans-and-pricing.md` (updated
  30 Jan 2026);
- `…/plans-and-pricing.md` (updated 25 Feb 2026).

The path: Developer Center → the app → **Pricing & Plans** → **Create
Pricing Version** → **Seat-based** → fill in → **Submit to review**.

The seat-based fields:

| Field | Rule |
|---|---|
| Price per seat (monthly) | "Must be a non-negative integer", in USD |
| Plan description | 1–255 characters |
| Plan includes | 1–5 bullet points, 1–255 characters each |
| Mode | Optimized ("Discounts are auto-applied per bucket based on monday.com's internal policies"), No Discount, or Manual |

Other rules:
- "All seat-based apps must include a trial." "The default trial period is 14
  days."
- For new apps, the pricing version "is reviewed as part of the broader
  marketplace approval process".
- monday reviews a pricing version "within 72 business hours".

## The values: decided by Samet, 27 Sep (Watchdog) and 28 Sep (Inventory)

Both apps: **Seat-based, $1 per seat per month, Optimized, 14-day trial**,
the same as the pricing pages on atesensoftware.com.

### Automation Watchdog (app 12249756)

- **Price per seat:** 1
- **Plan description:** Daily checks of every automation on the boards you
  can see, with an email when one stops.
- **Plan includes:**
  - Every board you can see, checked daily
  - Email alerts when an automation stops, and when it recovers
  - The board view, with mutes
  - Answers in sidekick, monday's AI assistant
- **Mode:** Optimized

### Automation Inventory (app 12255778)

- **Price per seat:** 1
- **Plan description:** Every automation on every board you can see, in one
  searchable list.
- **Plan includes:**
  - Every automation on every board you can see, in one list
  - Search, and filters for switched off and warnings
  - Open an automation's board in one click
  - Answers in sidekick, monday's AI assistant
- **Mode:** Optimized

The bullets are the ones on atesensoftware.com's pricing pages
(`../atesensoftware-site/build.mjs`), split into lines.

## Prompt for Claude-in-Chrome (fills in; Samet submits)

```
monday Developer Center'da bir uygulamanın fiyatlandırma sürümünü doldur ama GÖNDERME. Tek rapor ver. KURALLAR: Hiçbir gizli değeri (API token, Client Secret, Signing Secret) açma, kopyalama, gösterme. Regenerate'e basma. Şifre, 2FA, ödeme ya da güvenlik ekranı çıkarsa dur, bana sor. Ödeme yapma. "Submit to review"a BASMA. Açılır listeleri fareyle değil klavyeyle seç (fareyle tıklamak sekmeyi dondurabiliyor).

Uygulama: <Automation Watchdog ya da Automation Inventory>
1) Developer Center → bu uygulama → Pricing & Plans sekmesi. Sekme yoksa dur ve "sekme yok" yaz.
2) Create Pricing Version → Seat-based.
3) Alanlar (PRICING-VERSION.md'deki o uygulamanın değerleri):
   - Price per seat (monthly): 1
   - Plan description: <açıklama>
   - Plan includes: <4 madde, her biri ayrı satır>
   - Mode: Optimized
   - Deneme (trial) alanı çıkarsa: 14 gün
4) Formda burada yazmayan bir alan varsa boş bırak ve adını kelimesi kelimesine rapora yaz.
RAPOR: doldurulan alanlar, formda gördüğün bütün alan adları, uyarı/hata metinleri kelimesi kelimesine. Submit'e basmadığını teyit et.
```

## After monday approves the price

Turn billing on only then. Before that, no account has a plan, and every
account would be treated as unpaid. INFERENCE: during a trial,
`app_subscription` returns the trial, and the code counts that as a plan.

```
cd C:\Users\sametatesen2\boxdrank\monday-automation-watchdog
mapps code:env -i 12249756 -m set -k WATCHDOG_BILLING -v enforce
mapps code:push -s -f -a 12249756

cd C:\Users\sametatesen2\boxdrank\monday-automation-inventory
mapps code:env -i 12255778 -m set -k APP_BILLING -v enforce
mapps code:push -s -f -a 12255778
```

Then `/health` must read `"billing":"enforce"` for both.

The billing check looks only at whether any subscription exists, not at
`plan_id` (`subscriptionState` in Inventory's `src/server/app-server.js`;
Watchdog's the same). So the plan's id does not touch the code.
