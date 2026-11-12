# Station Four — the public demo

The site's audio is built from this folder, so anyone can check that what the
landing page plays is what the pipeline produced.

Nobody real is on it. The "actor" and the "customer" are two speakers from
Piper's LibriTTS voice (LibriTTS is CC BY 4.0), which is why it can sit on a
page that takes payments. Do **not** swap in Piper's Ryan voice or any other
model trained on a non-commercial dataset.

```bash
pip install piper-tts
# en_US-libritts-high.onnx + .onnx.json from the piper-voices releases
python3 tools/demo_game/make_assets.py --model ~/models/piper/en_US-libritts-high.onnx

python3 tools/local/tts_server.py --engine freevc --port 8124 &   # see docs/11
VOXSWAP_ORDERS_DIR=demo-game VOXSWAP_WORK_DIR=demo-game/work \
VOXSWAP_DELIVERY_DIR=demo-game/delivery VOXSWAP_LOCAL_VOICE_DIR=demo-game/.voices \
VOXSWAP_LOCAL_VC_URL=http://127.0.0.1:8124/vc python3 -m voxswap run order

python3 tools/demo_game/build_page.py --root demo-game
```

Output: `web/demo.html` (one file, both casts embedded) and six clips in
`web/audio/` for the landing page's player. Last build: 8/8 lines, median and
worst slot error 0 ms.

The order goes through the same ten stages and the same consent gate as a paid
one. Its consent is a signed self-declaration (`order/consent/C-1-signed.md`)
for a person who does not exist — the stand-in exercises the gate, it does not
dodge it.
