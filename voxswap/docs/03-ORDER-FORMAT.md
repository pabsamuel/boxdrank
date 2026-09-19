# `order.json` reference

One file describes one job. Copy `templates/order.template.json`, or let
`python3 -m voxswap new` write it for you.

Errors name the exact field and what to do about it, so when in doubt: change
something, run `python3 -m voxswap validate`, read the message.

---

## `customer`

```json
"customer": {
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "contact_locale": "en",
  "notes": "Wants it before her birthday, 14 March."
}
```

`email` is also used as the identity check for third-party consent: a consent
record for someone *else* may not reuse this address.

## `target` — what we are re-voicing

```json
"target": {
  "kind": "game",
  "title": "Cyberpunk 2077",
  "adapter": "generic",
  "asset_root": "assets",
  "include": ["vo/**/*.wav"],
  "exclude": ["**/music/**", "**/sfx/**"],
  "script_file": "dialogue.csv",
  "delivery_layout": "mirror",
  "output_format": "source"
}
```

| Field | Values | Notes |
| --- | --- | --- |
| `kind` | `game`, `movie` | |
| `adapter` | `generic`, `unreal`, `unity`, `wwise`, `video` | Changes discovery, delivery layout and the install instructions the customer gets. See [`06-TARGETS.md`](06-TARGETS.md). |
| `asset_root` | path | Relative to the order folder. **Read-only** — nothing is ever written here. |
| `include` | globs | Matched against the path relative to `asset_root`, POSIX-style, so the same order works on Windows and Linux. |
| `exclude` | globs | Applied after `include`. |
| `script_file` | path | `.srt`, `.vtt`, `.csv`, `.json`. Optional for games, **required for films**. |
| `delivery_layout` | `mirror`, `flat`, `mod` | `mirror` keeps the game's folder structure (what you almost always want). `mod` nests it under the engine's mod folder. |
| `output_format` | `source`, `wav` | `source` re-encodes back to the original codec (needs ffmpeg); `wav` always delivers WAV. |

## `language`

```json
"language": { "source": "en", "target": "tr" }
```

Same language (ignoring region) means the `translate` stage is skipped
entirely. `en-US` → `en-GB` is not a translation.

## `voices` — whose voice

```json
"voices": [
  { "voice_id": "ada", "person_label": "Ada", "samples_dir": "voices/ada",
    "consent_ref": "C-1", "gender_hint": "", "accent_hint": "" }
]
```

`voice_id` is your internal handle, referenced by `roles[]`. `provider_voice_id`
is written back by the pipeline after cloning — **do not set it by hand, and do
not delete it**, it is how withdrawal finds the clone later.

## `roles` — who they replace

```json
"roles": [
  { "role_id": "V", "display_name": "V (male)", "voice_id": "ada",
    "match": ["vo/v_male/**/*.wav"],
    "match_speakers": ["V", "player"],
    "style": "neutral" }
]
```

* `match` — globs on the file path.
* `match_speakers` — matched against the speaker label from the script or the
  folder name. Case- and punctuation-insensitive substring match.
* **First matching role wins**, so put specific roles before general ones.
* A single role with no patterns at all means "replace everything".

## `consents` — the gate

```json
"consents": [
  { "consent_ref": "C-1",
    "person_name": "Ada Lovelace",
    "person_email": "ada@example.com",
    "is_self": true,
    "signed_at": "2026-03-01",
    "signature_file": "consent/C-1-signed.pdf",
    "phrase_audio": "consent/C-1-phrase.wav",
    "scope": ["voice_clone", "personal_use"],
    "expires_at": "",
    "revoked": false }
]
```

Every field is enforced. See [`04-CONSENT-AND-RIGHTS.md`](04-CONSENT-AND-RIGHTS.md)
for what each check is actually protecting against.

## `options` — the knobs

```json
"options": {
  "preserve_timing": true,
  "max_stretch": 1.15,
  "target_lufs": -18.0,
  "emotion_transfer": true,
  "max_parallel": 4,
  "qc_max_duration_delta_ms": 250,
  "qc_min_pass_rate": 0.97,
  "dry_run_limit": 0
}
```

| Option | Default | Raise it when | Lower it when |
| --- | --- | --- | --- |
| `preserve_timing` | `true` | — | The engine does not care about clip length (rare) |
| `max_stretch` | `1.15` | Translated lines keep overflowing their slots | Lines sound rushed or artificial |
| `target_lufs` | `-18.0` | Lines sit too quiet in the mix | Lines are too loud or clipping (films usually want −23) |
| `emotion_transfer` | `true` | — | The provider's emotional reads are worse than its flat ones |
| `max_parallel` | `4` | The job is slow and the provider is happy | You are getting rate-limited (429s) |
| `qc_max_duration_delta_ms` | `250` | The engine is tolerant | Lip-synced cutscenes |
| `qc_min_pass_rate` | `0.97` | — | Never below ~0.9 on a paid order |
| `dry_run_limit` | `0` | — | Set to `5` for a cheap smoke test on a new title |

## `providers`

```json
"providers": { "asr": "mock", "translation": "claude", "voice": "elevenlabs" }
```

| Capability | Options |
| --- | --- |
| `asr` | `mock`, `openai`, `elevenlabs`, `local` |
| `translation` | `mock`, `claude` |
| `voice` | `mock`, `elevenlabs`, `local` |

`mock` needs no key, costs nothing, runs offline, and produces buzzes instead of
speech. Use it to test everything except how the voice sounds.
[`05-PROVIDERS.md`](05-PROVIDERS.md) covers the rest.
