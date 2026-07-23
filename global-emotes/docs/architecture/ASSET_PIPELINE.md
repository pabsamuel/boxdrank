# ASSET PIPELINE

`packages/asset-pipeline` (pure buffer functions, 11 tests) + upload routes (api) + processing handler (worker).

## Upload lifecycle (spec §11)

1. `POST /v1/uploads` → grant row (15-min TTL, size cap) + upload URL.
2. `PUT /v1/uploads/:id/content` → magic-byte sniff, byte-cap → **quarantine bucket**.
3. `POST /v1/creators/:id/emotes` → early validation (fail fast), plan checks (animated = Pro), duplicate-shortcode check → emote row (`processing`) + job.
4. Worker: re-validate → content-addressed original (`originals/<hh>/<hash>.<fmt>`) → 6 WebP variants (web_preview 112, keyboard 96, share 512, telegram 512 static, low_bandwidth 48, thumbnail 32; animation preserved where the variant wants it; transparent square padding) → `emote_asset_versions` row → emote `active` → quarantine object deleted.
5. Publishing is blocked while any pack emote is not `active`.

## Validation guarantees (tested)

Magic-byte MIME (spoofing rejected) · min/max dimensions · byte cap · frame count + duration caps for animation · decompression-bomb guard (`limitInputPixels`) · metadata stripped by re-encode · sha-256 content hash (dedupe: identical uploads share storage keys).

## Delivery

Processed variants are served via short-lived signed URLs from `/v1/sync/manifest` and public-preview URLs on pack pages (small `web_preview` only). Originals are never public. Takedown = emote status `takedown` → excluded from manifests → clients tombstone on next sync (remote cache purge documented as best-effort, honest limitation).

## Formats

In: PNG, JPEG (converted), WebP, GIF, animated WebP. Out: WebP everywhere (Telegram export uses the 512px static variant; animated Telegram WEBM export is a flagged follow-up). APNG/video: off by default (spec §11).
