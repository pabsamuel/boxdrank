"""`doctor` — the command an operator runs when something is not working.

Its job is to answer "is this machine ready?" without starting a job, which
matters most for a local setup: the first sign of a mistyped port should not be
a failed order three stages in.
"""

from __future__ import annotations

import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from voxswap.cli import _local_endpoints, _probe


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:                            # noqa: N802 - stdlib naming
        body = json.dumps({"status": "ready"}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


class ProbeTests(unittest.TestCase):
    def test_a_live_server_is_up(self) -> None:
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            reachable, _ = _probe(f"http://127.0.0.1:{httpd.server_address[1]}/tts")
            self.assertTrue(reachable)
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_a_dead_port_is_down_with_a_reason(self) -> None:
        reachable, detail = _probe("http://127.0.0.1:1/v1", timeout=1.0)
        self.assertFalse(reachable)
        self.assertTrue(detail, "the operator needs to know why, not just that")

    def test_probing_does_not_hang(self) -> None:
        """A wedged server must not wedge doctor."""
        import time

        start = time.monotonic()
        _probe("http://127.0.0.1:1/v1", timeout=0.5)
        self.assertLess(time.monotonic() - start, 5.0)


class EndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self._saved = {k: os.environ.get(k) for k in
                       ("VOXSWAP_OPENAI_BASE", "VOXSWAP_LOCAL_LLM_BASE", "VOXSWAP_LOCAL_TTS_URL")}
        for key in self._saved:
            os.environ.pop(key, None)

    def tearDown(self) -> None:
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_nothing_configured_reports_nothing(self) -> None:
        self.assertTrue(all(url == "" for _, url, _ in _local_endpoints()))

    def test_each_env_var_is_picked_up(self) -> None:
        os.environ["VOXSWAP_LOCAL_LLM_BASE"] = "http://127.0.0.1:8080/v1"
        os.environ["VOXSWAP_LOCAL_TTS_URL"] = "http://127.0.0.1:8123/tts"
        found = {label: url for label, url, _ in _local_endpoints()}
        self.assertEqual(found["translation"], "http://127.0.0.1:8080/v1")
        self.assertEqual(found["voice"], "http://127.0.0.1:8123/tts")

    def test_a_hosted_asr_base_is_not_listed_as_a_local_server(self) -> None:
        """Pointing at api.openai.com is not a local setup, and saying it is
        would send the operator debugging the wrong thing."""
        os.environ["VOXSWAP_OPENAI_BASE"] = "https://api.openai.com/v1"
        found = {label: url for label, url, _ in _local_endpoints()}
        self.assertEqual(found["transcription"], "")

    def test_a_local_asr_base_is_listed(self) -> None:
        os.environ["VOXSWAP_OPENAI_BASE"] = "http://127.0.0.1:8080/v1"
        found = {label: url for label, url, _ in _local_endpoints()}
        self.assertEqual(found["transcription"], "http://127.0.0.1:8080/v1")


if __name__ == "__main__":
    unittest.main()
