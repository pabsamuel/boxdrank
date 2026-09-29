---
name: playtest
description: Protocol for testing Perde on real phones and a TV, and for logging the result in docs/PLAYTESTS.md with latency and speech-accuracy numbers.
---

# /playtest

Perde cannot be judged from a sandbox; motion sensors and microphones need real phones. This
skill prepares everything so the human only has to hold the phones.

1. `pnpm build && pnpm dev:relay` (or use the deployed URL from `PERDE_URL`). For local iOS
   testing HTTPS is required: `wrangler dev --local-protocol https` or a cloudflared tunnel.
   Print the exact URLs for the TV (`/stage`) and the phones.
2. Give the tester this checklist, in Turkish if the tester's UI is Turkish:
   - Lobby shows 4 QR codes; scanning one opens the pick-up screen; "Kuklayı eline al" shows the
     motion permission sheet on iOS.
   - Tilt left/right → lean; tip forward → arm; shake → hop; drag the strip → walk. Note the delay.
   - Start "Yâr Bana Bir Eğlence" from the phone menu. Say each line in a normal voice; count
     lines that passed without "Söyledim". Try `normal` strictness too.
   - Two phones: check each phone shows "Sıra sende" only for its own character.
   - Kill the TV tab and reopen `/stage?room=CODE`: phones reconnect.
   - Punch and Judy (Plus / open mode): the crocodile's jaw moves while it talks.
3. Ask for: phone models, TV browser, network, latency estimate, speech pass count, what made the
   child laugh, what confused the parent.
4. Write the entry in `docs/PLAYTESTS.md` using the template (dated heading), tick the M2 box,
   run `pnpm metrics`, and turn every bug into a roadmap box or a fix in the same session.
