"""Voice conversion — the provider that rewrites a recording instead of reading a script.

The failure this file mostly guards against is not a crash. It is a conversion
provider quietly delivering the *original* words while `script.csv` promises
translated ones: audio that sounds fine, matches nothing, and is only caught by
a customer who speaks both languages.
"""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from tests.helpers import make_config, make_game_order
from voxswap.errors import ProviderError
from voxswap.log import Logger
from voxswap.pipeline import run_order
from voxswap.providers.base import SynthesisRequest
from voxswap.providers.local_vc import LocalVoiceConversion
from voxswap.providers.registry import VOICE_CONVERSION_PROVIDERS, get_voice
from voxswap.state import DONE, FAILED


def _wav(path: Path, ms: int = 400, rate: int = 22050) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x01\x00" * int(rate * ms / 1000))
    return path


class _VCServer(BaseHTTPRequestHandler):
    """A stand-in for the resident server: records what it was asked to convert."""

    seen: list[dict] = []

    def do_POST(self) -> None:                           # noqa: N802 - stdlib naming
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or "{}")
        type(self).seen.append({"path": self.path, **body})
        with open(body["source_wav"], "rb") as fh:       # echo the source back, converted "in place"
            audio = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    def log_message(self, *args: object) -> None:
        pass


class ConversionProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        _VCServer.seen = []
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _VCServer)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}/vc"

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self._tmp.cleanup()

    def _provider(self, url: str = "") -> LocalVoiceConversion:
        import os

        os.environ["VOXSWAP_LOCAL_VC_URL"] = url or self.url
        return LocalVoiceConversion(voice_dir=self.tmp / "voices")

    def test_the_source_recording_is_what_gets_sent(self) -> None:
        source = _wav(self.tmp / "hero_01.wav")
        reference = _wav(self.tmp / "ref.wav")
        out = self.tmp / "out.wav"

        self._provider().synthesize(
            SynthesisRequest(text="ignored entirely", provider_voice_id=str(reference),
                             source_path=source),
            out,
        )

        self.assertTrue(out.exists())
        sent = _VCServer.seen[0]
        self.assertEqual(sent["source_wav"], str(source.resolve()))
        self.assertEqual(sent["speaker_wav"], str(reference))
        self.assertNotIn("text", sent, "conversion must not depend on the script")

    def test_a_missing_source_is_refused_not_faked(self) -> None:
        """Returning silence here would ship a blank line to a paying customer."""
        with self.assertRaises(ProviderError) as caught:
            self._provider().synthesize(
                SynthesisRequest(text="Cover me.", provider_voice_id="/ref.wav", source_path=None),
                self.tmp / "out.wav",
            )
        self.assertIn("no source recording to convert", str(caught.exception))
        self.assertEqual(_VCServer.seen, [])

    def test_no_server_configured_says_how_to_start_one(self) -> None:
        import os

        os.environ.pop("VOXSWAP_LOCAL_VC_URL", None)
        provider = LocalVoiceConversion(voice_dir=self.tmp / "voices")
        with self.assertRaises(ProviderError) as caught:
            provider.synthesize(SynthesisRequest(text="x", provider_voice_id="/ref.wav",
                                                 source_path=_wav(self.tmp / "s.wav")),
                                self.tmp / "out.wav")
        self.assertIn("tts_server.py", str(caught.exception.hint))

    def test_a_non_wav_reply_is_rejected(self) -> None:
        class _Broken(_VCServer):
            def do_POST(self) -> None:                   # noqa: N802
                body = b'{"error": "model not loaded"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Broken)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            provider = self._provider(f"http://127.0.0.1:{httpd.server_address[1]}/vc")
            with self.assertRaises(ProviderError) as caught:
                provider.synthesize(
                    SynthesisRequest(text="x", provider_voice_id="/ref.wav",
                                     source_path=_wav(self.tmp / "s.wav")),
                    self.tmp / "out.wav",
                )
            self.assertIn("did not return a WAV", str(caught.exception))
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_it_is_registered_as_a_conversion_provider(self) -> None:
        self.assertIn("local_vc", VOICE_CONVERSION_PROVIDERS)
        self.assertTrue(get_voice("local_vc").converts_audio)
        self.assertFalse(get_voice("local").converts_audio, "plain TTS must not claim to convert")


class ConversionCannotTranslateTests(unittest.TestCase):
    """The guard that matters: conversion keeps the words, so it cannot dub."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.cfg = make_config(self.tmp)
        self.cfg.ensure_dirs()
        self.log = Logger("error")
        self.order_dir = make_game_order(self.cfg)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _set(self, **changes: object) -> None:
        path = self.order_dir / "order.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for key, value in changes.items():
            section, _, field = key.partition("__")
            data[section][field] = value
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def test_translating_with_a_conversion_provider_is_refused_at_intake(self) -> None:
        self._set(providers__voice="local_vc", language__target="tr")

        result = run_order(self.cfg, "TEST-GAME", log=self.log)

        self.assertEqual(result.status, FAILED)
        self.assertEqual(result.failed_stage, "intake", "it must fail before a single line is converted")
        message = result.error
        self.assertIn("local", message, "the hint must name the provider to switch to")
        self.assertIn("tr", message)

    def test_a_locale_variant_of_the_same_language_is_fine(self) -> None:
        """en -> en-GB is not a translation, so it must not be blocked."""
        self._set(providers__voice="local_vc", language__target="en-GB")
        import os

        os.environ.pop("VOXSWAP_LOCAL_VC_URL", None)

        result = run_order(self.cfg, "TEST-GAME", log=self.log)

        # It still fails — there is no VC server in a unit test — but it must get
        # past intake to do so, which is what this asserts.
        self.assertNotEqual(result.failed_stage, "intake", f"blocked too early: {result.error}")

    def test_the_same_order_runs_with_text_to_speech(self) -> None:
        self._set(providers__voice="mock", language__target="tr")
        self.assertEqual(run_order(self.cfg, "TEST-GAME", log=self.log).status, DONE)


if __name__ == "__main__":
    unittest.main()
