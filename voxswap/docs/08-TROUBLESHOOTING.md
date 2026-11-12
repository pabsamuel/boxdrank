# Troubleshooting

Every error names the file and the fix. If you are reading a traceback instead
of a message, that is a bug worth reporting.

**First two things, always:**

```bash
python3 -m voxswap status ORD-123     # which stage, and what it said
less work/ORD-123/job.log             # everything the stages printed
```

---

## It will not start

| Message | Fix |
| --- | --- |
| `could not find an order called ...` | `python3 -m voxswap list` to see real IDs. The argument can be an ID, a folder name, or a path. |
| `order.json is not valid JSON` | Usually a trailing comma or a missing quote. Paste it into any JSON validator. |
| `customer.email is missing` | Exactly that. Every error names the field. |
| `roles reference voice_id 'x' which is not in voices[]` | A typo in `roles[].voice_id` or a missing `voices[]` entry. |
| `order is already being processed` | Another run holds the lock. Wait, or delete `work/<order>/.lock` if the process is gone. |

## Consent failures

All of these are intentional hard stops. See [`04-CONSENT-AND-RIGHTS.md`](04-CONSENT-AND-RIGHTS.md).

| Message | Fix |
| --- | --- |
| `verification phrase recording missing` | `python3 -m voxswap phrase ORD-123`, send it, save their WAV where it says. |
| `verification phrase ... is only 1.2s long` | Too short to contain the phrase. Ask again. |
| `signed consent document missing` | Save the signed form and point `signature_file` at it. |
| `consent ... is for another person but uses the customer's email` | Get that person's own address. This is the point of the check. |
| `consent ... has been revoked` | Do not work around it. `purge` and stop. |
| `consent ... is dated in the future` | Fix the date. |

## Nothing matched

```
none of the 12043 clip(s) matched any role
```

Open `work/<order>/assets.json` and look at the real paths, then fix
`roles[].match`. Globs are matched against the path relative to `asset_root`,
POSIX-style. `"v_male/*.wav"` will not match `vo/v_male/a.wav` — you want
`"**/v_male/*.wav"`.

## Audio problems

| Message | Fix |
| --- | --- |
| `cannot read X without ffmpeg` | Install ffmpeg. Without it only plain PCM WAV works. |
| `X is a WAV file Python cannot read directly` | 32-bit float or compressed WAV. Same fix: ffmpeg. |
| `unsupported WAV sample width: 64-bit` | Same fix. |
| `target.asset_root is empty` | The upload did not finish, or `asset_root` points at the wrong folder. |

**Install ffmpeg.** It is the single highest-value thing you can do to this
machine: every format, real time-stretching, real loudness normalisation, and
film support.

## Provider problems

| Message | Fix |
| --- | --- |
| `ELEVENLABS_API_KEY is not set` | Put it in `voxswap/.env`, or set that provider to `mock`. |
| `the anthropic package is not installed` | `pip install anthropic`, or use `"translation": "mock"`. |
| `... rate limit hit` | Lower `options.max_parallel`, then `run --from <stage>`. Finished work is kept. |
| `The ... account is out of credit` | Top up. Re-run; already-generated takes are reused. |
| `model 'x' is not available to this account` | Set `VOXSWAP_CLAUDE_MODEL` to one you have. |
| `Claude declined to translate this batch` | Read the lines in that batch. If they are legitimate, translate them by hand into `lines.json` and re-run `--from voice`. |
| `provider unreachable` | Network or proxy. The adapters retry with backoff first, so this means it stayed down. |

## Quality gate failures

```
only 62.0% of lines passed QC (need 97%) — nothing was packaged
```

Working as intended: a bad build never becomes a deliverable. Read
`work/<order>/report/qc.md`, which lists every finding by kind, fix the cause,
then `--from synthesize` (or `--from master` if the takes themselves are fine).

## The watcher is not picking up an order

Ask it:

```bash
python3 -m voxswap watch --dry-run --settle 0
```

| Reason | Meaning |
| --- | --- |
| `hold` | There is a `.hold` file in the folder. Delete it when the upload is complete. |
| `wait` | `order.json` changed seconds ago; it waits 20s so it never grabs a half-finished upload. |
| `skip status=done` | Already delivered. |
| `skip ... needs a human` | It failed. The watcher never silently retries a failure — fix it, then `run --from <stage>`. |

## Something is slow

* `max_parallel` too low — raise it until the provider complains.
* Huge `include` patterns — you are indexing the whole game. Narrow them.
* No ffmpeg — the built-in time-stretcher is pure Python and slower.
* A long film — the streaming mix is one pass over the whole runtime. Normal.

## Starting over

```bash
rm -rf work/ORD-123          # throws away time and money, never customer data
python3 -m voxswap run ORD-123
```

`orders/<order>/` is the customer's data. Only `purge` should ever remove it.
