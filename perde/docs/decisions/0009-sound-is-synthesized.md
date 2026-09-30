# 0009 — The show opens like a real one, and its sounds are synthesized

## Context

A Karagöz show does not start cold. A göstermelik hangs on the lit screen while the audience
settles; the nareke, a reed whistle with a buzz, sounds as it is lifted; the tef greets the
figures and turns the sections; the end has a sting. None of that existed, and the TV had no
sound at all.

## Decision

1. **The lobby is the pre-show.** The culture names a `showpiece`; the stage hangs it on its own
   rod (with a slow sway) while the room waits, and lifts it off the top of the screen, with the
   nareke and then an entrance tef pattern, the moment the first puppeteer picks up a rod.
2. **Sounds are synthesized with WebAudio, not sampled.** The nareke is a sawtooth with a fast
   tremble through a bandpass; a tef hit is a pitched thump, a burst of filtered noise and three
   ringing triangles; the sting is four falling notes and a hit. Nothing is downloaded, nothing
   has a licence, and every culture can have its own set in a page of code.
3. **One tap unlocks audio and fullscreen.** Browsers refuse to start audio (and speech
   synthesis) before the page is touched, so the lobby carries a "Sound on · Fullscreen" button,
   any click or key on the TV unlocks it, and a chip in the corner says so until it happens.
4. **Sounds are a room setting** (`sound`, toggled from the phone menu), separate from the TV
   voice, so a family can keep the narration and drop the drum.

## Consequences

- `docs/ART.md` documents the göstermelik file; `CONTENT_GUIDE.md` the `showpiece` field.
- The demo lifts the göstermelik at once (its puppeteers join at load), which is fine.
- The next sounds to add are per-gesture hits (a jump, a fall) and a synthesized semai.
