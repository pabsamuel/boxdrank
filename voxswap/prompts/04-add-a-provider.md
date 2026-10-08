# Add a provider

Use when you want VoxSwap to support a new ASR, translation or voice service.

---

Add support for `<PROVIDER NAME>` as a `<asr | translation | voice>` provider.

Documentation: `<LINK, OR PASTE THE RELEVANT API DOCS>`

Read `voxswap/providers/base.py` and an existing adapter first
(`providers/elevenlabs.py` is the fullest one), then follow the rules in
`CLAUDE.md` and `docs/05-PROVIDERS.md`:

* match the protocol exactly; no extra requirements leaking into the stages
* endpoints, model IDs and output formats go in **env vars**, so I can fix a
  changed model ID without a code change
* raise `ProviderError(message, hint)` where the hint tells me what to do —
  never a bare traceback
* never log or print the API key
* for a voice provider: `ensure_voice` must reuse an existing clone rather than
  creating a duplicate on every run, and **`delete_voice` must be implemented** —
  withdrawal of consent has to actually work
* use `urllib` via `providers/http.py` unless the service has an official SDK,
  in which case import it lazily so the core stays dependency-free

Then:

1. Register a lazy factory in `providers/registry.py`.
2. Add tests to `tests/test_providers.py` that do not touch the network —
   at minimum: it loads without credentials, and an unknown-provider error lists
   it as an option.
3. Add it to the table in `docs/05-PROVIDERS.md` with its real trade-offs
   (cost shape, privacy, quality, what it is bad at), and to `.env.example`.
4. Run `python3 -m unittest discover -s tests -t .`.

Tell me what I need to do myself: which key to get, which env vars to set, and
what to run to prove it works against a live account.

---
