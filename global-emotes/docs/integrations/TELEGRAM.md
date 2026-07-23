# Telegram export

Status: **credentials_required** (export channel, not an entitlement provider). Flag `telegram_export` on by default; worker job `telegram-export` queued per fan request when the creator allows export (`emote_packs.allow_telegram_export`).

Bot API design: `createNewStickerSet` / `addStickerToSet` / `deleteStickerFromSet`; static stickers = 512px WEBP/PNG (the pipeline's `telegram` variant is exactly this); animated = WEBM VP9 (flagged follow-up). Set name pattern `<packslug>_by_<botname>`; attribution in the set title. Stable emote→sticker mapping preserved by content hash on regeneration.

Honest limitation (documented to creators in the studio): deleting a sticker stops new distribution, but users who added the set may retain cached copies — full remote wipe is not possible on Telegram.

Owner action: create bot via @BotFather → `TELEGRAM_BOT_TOKEN`.
