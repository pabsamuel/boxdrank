# Glossary

Plain-language definitions of the words this project uses. If a doc uses a term
you do not know, it is here.

| Term | What it means |
| --- | --- |
| **ASR** | Automatic speech recognition — turning audio into text. Only used for lines the customer's script does not cover. |
| **Asset** | Any file we might replace: a voice clip in a game, or a film file. |
| **`asset_root`** | The folder in the order holding the customer's game/film audio. Read-only, always. |
| **Bark** | A short, repeated ambient line ("Reloading!", "Over here!"). Cheap to replace, high impact. |
| **`.bnk` / `.wem`** | Wwise sound bank and stream files. Not plain audio; needs the game's own tooling to get audio back in. |
| **Clone** | The synthetic copy of a person's voice held at the provider (or as a local reference file). |
| **Consent phrase** | The order-specific sentence a person records to prove they agreed. Name + date + order ID. The anti-abuse control. |
| **Ducking** | Turning the original audio down under a dubbed line, fading in and out so the drop is inaudible. How the film path works. |
| **Dub track** | A full-length audio track for a film, with the new voice mixed over the original. |
| **ffmpeg** | The free audio/video tool. Optional, but it unlocks every format, real time-stretching, real loudness normalisation and film support. |
| **Line** | One utterance we replace. The unit of work: it has text, a slot, a role and a status. |
| **Loudness / LUFS** | How loud something *sounds* (not its peak). Matching it is what makes a swapped line sit in the mix instead of standing out. |
| **M&E track** | Music-and-effects: a film mix with the dialogue removed. Dubbing studios have one; retail discs do not. |
| **Mastering** | Our stage 8: trim, fit the timing, match loudness, match format. |
| **`manifest.json`** | The list of every delivered file, the original it replaces, and both checksums. What makes a delivery reversible. |
| **Mock provider** | The offline, free, deterministic fake. Runs the whole pipeline without keys so you can test everything but the sound. |
| **Order** | One customer job: one folder, one `order.json`. |
| **Overflow** | A line that is still longer than its slot after the maximum allowed time-compression. Flagged, never cut. |
| **`.pak` / `.utoc` / `.ucas`** | Unreal Engine archives. Extract before, repack after. |
| **Pass rate** | Fraction of planned lines that survived QC. Below `qc_min_pass_rate` the job fails and nothing is packaged. |
| **Provider** | A swappable service: ASR, translation, or voice. Chosen per order. |
| **Role** | A character being replaced, bound to one voice. |
| **Slot** | How long a line is allowed to be — the duration of the original clip, or of the subtitle cue. |
| **Stage** | One step of the pipeline. Ten of them, each resumable. |
| **Take** | One raw synthesis result, before any fitting or levelling. |
| **Time-stretch** | Making audio longer or shorter without changing pitch. Chipmunk voices come from *not* doing this properly. |
| **TTS** | Text to speech. |
| **Withdrawal / purge** | Destroying a clone and everything made from it, at the provider and locally, because consent was withdrawn. |
| **Workspace** | `work/<order>/` — all intermediate files. Safe to delete; costs only time and money, never customer data. |
