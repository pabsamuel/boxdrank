# KEYBOARD COMPATIBILITY MATRIX

Source of truth for user-facing claims. **No entry may be marked ✓ without a dated real-device test.** The server registry (`GET /v1/compatibility`) mirrors this file; runtime `EditorInfo` detection always wins on Android.

Capabilities: D = direct insertion (commitContent) · C = clipboard paste · S = share sheet.

## Android

| App             | Static       | Animated         | Verified device/date | Notes                          |
| --------------- | ------------ | ---------------- | -------------------- | ------------------------------ |
| Google Messages | D (expected) | D gif (expected) | — pending            | commitContent widely supported |
| Telegram        | D (expected) | D (expected)     | — pending            | sticker export preferred       |
| Discord         | D (expected) | C (expected)     | — pending            |                                |
| WhatsApp        | C            | C                | — pending            | rejects most commitContent     |
| Slack           | D (expected) | C (expected)     | — pending            |                                |
| Instagram DM    | C            | C                | — pending            |                                |

## iOS (keyboard = paste flow by platform design)

| App      | Paste static | Paste animated | Share ext | Verified  | Notes               |
| -------- | ------------ | -------------- | --------- | --------- | ------------------- |
| Telegram | C            | C              | S         | — pending |                     |
| WhatsApp | C            | C (as gif)     | S         | — pending |                     |
| iMessage | C            | C              | S         | — pending | sticker ext post-v1 |
| Discord  | C            | C              | S         | — pending |                     |

Marketing rule: "works across supported apps" — never "works everywhere" (Spec B §2).
