# `tools/games/` — swapping voices inside a real game

`unity_voice.py` does for a Unity game what the pipeline does for loose WAV
files: it takes the voice lines out of the game's own bundles, converts them to
a new voice, and writes them back so the game plays them.

```bash
pip install UnityPy fmod_toolkit          # tools only; the core stays stdlib

python3 tools/games/unity_voice.py list    X.bundle                  # what is inside
python3 tools/games/unity_voice.py extract X.bundle work/X/original   # decode via FMOD
python3 tools/games/unity_voice.py convert work/X/original work/X/new \
        --voice voices/new-voice.wav --vc http://127.0.0.1:8124/vc  # local_vc server
python3 tools/games/unity_voice.py rebuild X.bundle work/X/new out/X.bundle
python3 tools/games/unity_voice.py verify  out/X.bundle work/X/new  # must say no problems
```

Then back up the game's original bundle and put `out/X.bundle` in its place.

## What it does to a bundle

Unity stores each `AudioClip` as an FMOD sound bank (FSB5) in the bundle's
`.resource` stream, normally Vorbis. Nobody ships a free FSB5 Vorbis encoder,
so rebuilt clips are written as **PCM** FSB5 — simple to write, and read
natively by FMOD, which is what the game plays them with. The clip's
compression format, rate, channels and length are updated to match.

* Only clips with a replacement WAV are touched; everything else in the bundle
  is written back byte for byte (checked: 31 untouched clips identical after a
  rebuild of a real Unity bundle).
* New audio is appended to the resource stream, not written over the old, so
  no other object's data moves.
* `convert` keeps each line's exact length and matches its loudness to the
  original, so lip-sync, subtitles and the mix are unaffected.
* PCM is bigger than Vorbis: a converted bundle is several times the size of
  the original. Expect hundreds of MB for a major character.

`verify` re-opens the rebuilt bundle and decodes every replaced clip through
FMOD; on the test bundle the decoded samples matched what was written exactly.
That proves FMOD accepts the banks. The final test is still the game itself.

## Disco Elysium: The Final Cut

Unity 2020.3, IL2CPP. Voice lines live in Addressables bundles in
`disco_Data/StreamingAssets/aa/StandaloneWindows64/`, one group per location
and speaker — e.g. the clips with `"AssetBundle": "whirling_kim-kitsuragi"` in
the game's `VoiceOverClipsLibrary` are Kim Kitsuragi in the Whirling-in-Rags.
Clip names read `Speaker-CONVERSATION-n` (`Kim Kitsuragi-WHIRLING  KIM MAIN-55`).
Existing voice mods for the game install by overwriting these bundle files, so
a rebuilt bundle goes in the same way.

The work happens with the customer's own copy of the game, for their personal
use. Game audio is someone else's copyright: never commit it, publish it, or
put it anywhere public.
