"""The local voice provider, in both modes.

The HTTP mode is the one that matters for real work: a per-line subprocess
reloads the model every utterance, so a resident server is the difference
between a job that finishes overnight and one that does not finish.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from voxswap.audio import read_wav, tone, write_wav
from voxswap.errors import ProviderError
from voxswap.providers.base import SynthesisRequest
from voxswap.providers.local import LocalVoice


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:                           # noqa: N802 - stdlib naming
        length = int(self.headers.get("Content-Length", "0"))
        self.server.requests.append(json.loads(self.rfile.read(length) or "{}"))  # type: ignore[attr-defined]
        replies = self.server.replies                    # type: ignore[attr-defined]
        reply = replies.pop(0) if replies else b""

        if isinstance(reply, int):
            self.send_response(reply)
            self.end_headers()
            self.wfile.write(b'{"error": "engine exploded"}')
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

    def log_message(self, *args: object) -> None:
        pass


class FakeTTSServer:
    def __init__(self, replies: list) -> None:
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.httpd.replies = list(replies)               # type: ignore[attr-defined]
        self.httpd.requests = []                         # type: ignore[attr-defined]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self.httpd.server_address[:2]
        return f"http://{host}:{port}/tts"

    @property
    def requests(self) -> list[dict]:
        return self.httpd.requests                       # type: ignore[attr-defined]

    def __enter__(self) -> "FakeTTSServer":
        self.thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


def wav_bytes(duration_ms: int = 800, rate: int = 16000) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "a.wav"
        write_wav(path, tone(duration_ms, sample_rate=rate))
        return path.read_bytes()


class ServerModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.reference = self.tmp / "ref.wav"
        write_wav(self.reference, tone(3000, sample_rate=16000))

    def tearDown(self) -> None:
        self._tmp.cleanup()
        os.environ.pop("VOXSWAP_LOCAL_TTS_URL", None)

    def _provider(self, server: FakeTTSServer) -> LocalVoice:
        os.environ["VOXSWAP_LOCAL_TTS_URL"] = server.url
        return LocalVoice(voice_dir=self.tmp / "voices")

    def test_a_line_is_synthesised_over_http(self) -> None:
        with FakeTTSServer([wav_bytes(900)]) as server:
            provider = self._provider(server)
            out = provider.synthesize(
                SynthesisRequest(text="Wake up.", provider_voice_id=str(self.reference),
                                 language="tr-TR", emotion="angry", sample_rate=16000),
                self.tmp / "line.wav",
            )
        self.assertTrue(out.exists())
        self.assertEqual(read_wav(out).duration_ms, 900)

        sent = server.requests[0]
        self.assertEqual(sent["text"], "Wake up.")
        self.assertEqual(sent["speaker_wav"], str(self.reference))
        self.assertEqual(sent["language"], "tr")          # locale reduced to a language code
        self.assertEqual(sent["emotion"], "angry")

    def test_server_mode_wins_over_the_command(self) -> None:
        """With a server configured we must not spawn a process per line."""
        os.environ["VOXSWAP_LOCAL_TTS_CMD"] = "false"     # would fail if it were used
        try:
            with FakeTTSServer([wav_bytes()]) as server:
                provider = self._provider(server)
                provider.synthesize(
                    SynthesisRequest(text="hello", provider_voice_id=str(self.reference)),
                    self.tmp / "line.wav",
                )
            self.assertEqual(len(server.requests), 1)
        finally:
            os.environ.pop("VOXSWAP_LOCAL_TTS_CMD", None)

    def test_a_non_wav_reply_is_reported_clearly(self) -> None:
        with FakeTTSServer([b'{"error": "out of memory"}']) as server:
            provider = self._provider(server)
            with self.assertRaises(ProviderError) as caught:
                provider.synthesize(
                    SynthesisRequest(text="hello", provider_voice_id=str(self.reference)),
                    self.tmp / "line.wav",
                )
        self.assertIn("did not return a WAV", caught.exception.message)
        self.assertIn("out of memory", caught.exception.hint)

    def test_a_server_error_surfaces(self) -> None:
        with FakeTTSServer([500, 500]) as server:
            provider = self._provider(server)
            with self.assertRaises(ProviderError):
                provider.synthesize(
                    SynthesisRequest(text="hello", provider_voice_id=str(self.reference)),
                    self.tmp / "line.wav",
                )

    def test_no_server_configured_means_command_mode(self) -> None:
        provider = LocalVoice(voice_dir=self.tmp / "voices")
        self.assertEqual(provider.server_url, "")
        with self.assertRaises(ProviderError) as caught:
            provider.synthesize(
                SynthesisRequest(text="hello", provider_voice_id=str(self.reference)),
                self.tmp / "line.wav",
            )
        self.assertIn("VOXSWAP_LOCAL_TTS_CMD", caught.exception.message)


class ReferenceClipTests(unittest.TestCase):
    """'Cloning' locally means building one clean reference clip."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.voice_dir = self.tmp / "voices"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_samples_are_concatenated_into_one_reference(self) -> None:
        samples = []
        for i in range(3):
            path = self.tmp / f"s{i}.wav"
            write_wav(path, tone(2000, freq=140 + i * 10, sample_rate=16000))
            samples.append(path)

        provider = LocalVoice(voice_dir=self.voice_dir)
        reference = Path(provider.ensure_voice("main", "Ada", samples, consent_ref="C-1"))
        self.assertTrue(reference.exists())
        self.assertAlmostEqual(read_wav(reference).duration_ms, 6000, delta=50)

    def test_an_existing_reference_is_reused(self) -> None:
        sample = self.tmp / "s.wav"
        write_wav(sample, tone(2000, sample_rate=16000))
        provider = LocalVoice(voice_dir=self.voice_dir)
        first = provider.ensure_voice("main", "Ada", [sample], consent_ref="C-1")
        stamp = Path(first).stat().st_mtime_ns
        second = provider.ensure_voice("main", "Ada", [sample], consent_ref="C-1")
        self.assertEqual(first, second)
        self.assertEqual(Path(second).stat().st_mtime_ns, stamp)

    def test_unreadable_samples_are_reported(self) -> None:
        bad = self.tmp / "bad.wav"
        bad.write_bytes(b"not audio at all")
        provider = LocalVoice(voice_dir=self.voice_dir)
        with self.assertRaises(ProviderError) as caught:
            provider.ensure_voice("main", "Ada", [bad], consent_ref="C-1")
        self.assertIn("could be read", caught.exception.message)

    def test_deleting_a_voice_removes_the_reference(self) -> None:
        """Withdrawal has to work locally too."""
        sample = self.tmp / "s.wav"
        write_wav(sample, tone(2000, sample_rate=16000))
        provider = LocalVoice(voice_dir=self.voice_dir)
        reference = provider.ensure_voice("main", "Ada", [sample], consent_ref="C-1")
        provider.delete_voice(reference)
        self.assertFalse(Path(reference).exists())


if __name__ == "__main__":
    unittest.main()
