# 0010 — The TV remembers the room; phones re-send what the TV cannot keep

## Context

Living rooms are hostile: a phone screen locks and its socket dies, the TV browser gets
reloaded, Wi-Fi hiccups. Before this the relay handled the sockets well (a reloaded phone
replaces its seat, a reloaded TV replaces the stage) but a reloaded TV came back in the lobby
with the play gone, and a phone that reconnected said nothing and sent nothing until the hand
moved.

## Decision

1. **The TV writes a snapshot of the room to session storage on every change** (state, casting,
   names, host) and reads it back on load when the room code matches. Seats come back
   disconnected; the relay's `welcome` lists who is really on a phone and the reducer joins them.
   If nobody is, the room drops to the lobby. Custom puppet images are not in the snapshot (too
   big for storage); poses and gestures are ephemeral.
2. **Phones resync.** On `welcome` (their own reconnect) and on `stage: online` (a TV that came
   back) a phone re-sends its current pose and its newest drawing after a short delay, so the
   figure stands where the hand is and the drawing is back on stage without anyone doing
   anything. When the phone's screen comes back (`visibilitychange`) it also retakes the wake
   lock and the microphone.
3. **Say it when it happens.** The phone shows "Yeniden bağlanıyor…" while its socket is not
   open; the TV shows the same as a chip. The TV's `?` (or `h`) key and a `?` chip open a card
   with the keys and the phone gestures.

## Consequences

- `snapshotModel` / `restoreModel` and the `welcome` and `restore` events live in the stage
  machine and are unit-tested as a round trip; the e2e reloads the TV mid-play.
- Session storage is per tab: opening the stage in a second tab starts a second room on purpose.
- The host seat may change after a TV reload (the first phone to be listed becomes host).
