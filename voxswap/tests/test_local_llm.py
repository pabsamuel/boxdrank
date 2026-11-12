"""The local-LLM translation provider, against a real HTTP server.

No network and no model: a stdlib `http.server` stands in for llama.cpp. That
is enough to verify everything that actually breaks in practice — the request
shape, batching, and what happens when a small model answers badly, which it
will.
"""

from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from voxswap.errors import ProviderError
from voxswap.providers.dubbing import parse_string_array
from voxswap.providers.local_llm import LocalLLMTranslation


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:                           # noqa: N802 - stdlib naming
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or "{}")
        self.server.requests.append(body)                # type: ignore[attr-defined]

        replies = self.server.replies                    # type: ignore[attr-defined]
        reply = replies.pop(0) if replies else ""

        if isinstance(reply, int):                       # an HTTP status to fail with
            self.send_response(reply)
            self.end_headers()
            self.wfile.write(b'{"error": "nope"}')
            return
        if isinstance(reply, bytes):                     # a raw, malformed body
            self.send_response(200)
            self.end_headers()
            self.wfile.write(reply)
            return

        payload = {"choices": [{"message": {"role": "assistant", "content": reply}}]}
        raw = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args: object) -> None:        # keep test output clean
        pass


class FakeServer:
    """A throwaway OpenAI-compatible endpoint on a random local port."""

    def __init__(self, replies: list) -> None:
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.httpd.replies = list(replies)               # type: ignore[attr-defined]
        self.httpd.requests = []                         # type: ignore[attr-defined]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def base(self) -> str:
        host, port = self.httpd.server_address[:2]
        return f"http://{host}:{port}/v1"

    @property
    def requests(self) -> list[dict]:
        return self.httpd.requests                       # type: ignore[attr-defined]

    def __enter__(self) -> "FakeServer":
        self.thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


def provider_for(server: FakeServer, **env) -> LocalLLMTranslation:
    import os

    os.environ["VOXSWAP_LOCAL_LLM_BASE"] = server.base
    for key, value in env.items():
        os.environ[key] = str(value)
    try:
        return LocalLLMTranslation()
    finally:
        for key in ["VOXSWAP_LOCAL_LLM_BASE", *env]:
            os.environ.pop(key, None)


class RequestShapeTests(unittest.TestCase):
    def test_translation_round_trip(self) -> None:
        with FakeServer(['["Uyan. Beş dakikaya çıkıyoruz.", "Yere yat dedim!"]']) as server:
            provider = provider_for(server)
            out = provider.translate(
                ["Wake up. We are moving out in five.", "I said get down!"],
                source="en", target="tr", context="game 'Example'",
            )
        self.assertEqual(out, ["Uyan. Beş dakikaya çıkıyoruz.", "Yere yat dedim!"])

        request = server.requests[0]
        self.assertEqual(len(request["messages"]), 2)
        self.assertEqual(request["messages"][0]["role"], "system")
        self.assertIn("dubbing", request["messages"][0]["content"])
        self.assertIn("Target language: tr", request["messages"][1]["content"])
        self.assertIn("game 'Example'", request["messages"][1]["content"])
        self.assertEqual(request["temperature"], 0.2)
        self.assertFalse(request["stream"])

    def test_model_name_is_sent(self) -> None:
        with FakeServer(['["x"]']) as server:
            provider = provider_for(server, VOXSWAP_LOCAL_LLM_MODEL="qwen3:14b")
            provider.translate(["x"], source="en", target="de")
        self.assertEqual(server.requests[0]["model"], "qwen3:14b")

    def test_empty_input_makes_no_request(self) -> None:
        with FakeServer([]) as server:
            provider = provider_for(server)
            self.assertEqual(provider.translate([], source="en", target="tr"), [])
        self.assertEqual(server.requests, [])


class BatchingTests(unittest.TestCase):
    def test_lines_are_split_into_batches(self) -> None:
        """Small models lose count on long lists, so the batch size is small
        and configurable."""
        # 10 lines at batch size 3 -> batches of 3, 3, 3, 1
        replies = [json.dumps([f"t{i}" for i in range(n)]) for n in (3, 3, 3, 1)]
        with FakeServer(replies) as server:
            provider = provider_for(server, VOXSWAP_LOCAL_LLM_BATCH=3)
            out = provider.translate([f"line {i}" for i in range(10)], source="en", target="tr")
        # 10 lines at batch size 3 -> 4 requests (3+3+3+1)
        self.assertEqual(len(server.requests), 4)
        self.assertEqual(len(out), 10)

    def test_last_partial_batch_asks_for_the_right_count(self) -> None:
        with FakeServer([json.dumps(["a", "b"]), json.dumps(["c"])]) as server:
            provider = provider_for(server, VOXSWAP_LOCAL_LLM_BATCH=2)
            out = provider.translate(["a", "b", "c"], source="en", target="tr")
        self.assertEqual(out, ["a", "b", "c"])
        self.assertEqual(len(json.loads(server.requests[1]["messages"][1]["content"].split("Lines:\n")[1])), 1)


class SloppyModelTests(unittest.TestCase):
    """A 7B model answers imperfectly. None of that may lose a customer's line."""

    def test_markdown_fence_is_stripped(self) -> None:
        with FakeServer(['```json\n["merhaba"]\n```']) as server:
            provider = provider_for(server)
            self.assertEqual(provider.translate(["hello"], source="en", target="tr"), ["merhaba"])

    def test_chatty_preamble_is_ignored(self) -> None:
        with FakeServer(['Sure! Here is the translation:\n["merhaba"]\nHope that helps.']) as server:
            provider = provider_for(server)
            self.assertEqual(provider.translate(["hello"], source="en", target="tr"), ["merhaba"])

    def test_wrong_count_triggers_a_stricter_retry(self) -> None:
        with FakeServer(['["one", "two", "three"]', '["one", "two"]']) as server:
            provider = provider_for(server)
            out = provider.translate(["a", "b"], source="en", target="tr")
        self.assertEqual(out, ["one", "two"])
        self.assertEqual(len(server.requests), 2)
        self.assertIn("exactly 2 strings", server.requests[1]["messages"][1]["content"])

    def test_persistent_failure_falls_back_to_one_line_at_a_time(self) -> None:
        # batch, stricter retry, then a single call per line
        with FakeServer(["garbage", "still garbage", '["bir"]', '["iki"]']) as server:
            provider = provider_for(server)
            out = provider.translate(["one", "two"], source="en", target="tr")
        self.assertEqual(out, ["bir", "iki"])
        self.assertEqual(len(server.requests), 4)

    def test_a_line_the_model_never_manages_keeps_its_source_text(self) -> None:
        """Untranslated in script.csv is recoverable. A dropped line is not."""
        with FakeServer(["no", "no", "no", '["iki"]']) as server:
            provider = provider_for(server)
            out = provider.translate(["one", "two"], source="en", target="tr")
        self.assertEqual(out, ["one", "iki"])


class FailureTests(unittest.TestCase):
    def test_a_non_openai_response_names_the_problem(self) -> None:
        with FakeServer([b'{"result": "surprise"}']) as server:
            provider = provider_for(server)
            with self.assertRaises(ProviderError) as caught:
                provider.translate(["hello"], source="en", target="tr")
        self.assertIn("OpenAI-compatible", caught.exception.hint)

    def test_html_instead_of_json_is_reported_readably(self) -> None:
        with FakeServer([b"<html>404 not found</html>"]) as server:
            provider = provider_for(server)
            with self.assertRaises(ProviderError) as caught:
                provider.translate(["hello"], source="en", target="tr")
        self.assertIn("not JSON", caught.exception.message)

    def test_server_error_mentions_the_base_url(self) -> None:
        with FakeServer([404, 404]) as server:
            provider = provider_for(server)
            with self.assertRaises(ProviderError) as caught:
                provider.translate(["hello"], source="en", target="tr")
        self.assertIn("127.0.0.1", caught.exception.message)
        self.assertIn("/v1", caught.exception.hint)

    def test_unreachable_server_says_so(self) -> None:
        import os

        os.environ["VOXSWAP_LOCAL_LLM_BASE"] = "http://127.0.0.1:1/v1"   # nothing listens on port 1
        try:
            provider = LocalLLMTranslation()
        finally:
            os.environ.pop("VOXSWAP_LOCAL_LLM_BASE", None)
        with self.assertRaises(ProviderError) as caught:
            provider.translate(["hello"], source="en", target="tr")
        self.assertIn("unreachable", caught.exception.message)


class EmotionTests(unittest.TestCase):
    def test_emotion_labels_are_returned(self) -> None:
        with FakeServer(['["angry", "neutral"]']) as server:
            provider = provider_for(server)
            self.assertEqual(provider.annotate_emotions(["GET DOWN!", "It is quiet."]),
                             ["angry", "neutral"])

    def test_a_bad_emotion_response_defaults_to_neutral(self) -> None:
        """A style hint must never be the reason a job fails."""
        with FakeServer(["nonsense"]) as server:
            provider = provider_for(server)
            self.assertEqual(provider.annotate_emotions(["a", "b"]), ["neutral", "neutral"])


class ProxyBypassTests(unittest.TestCase):
    """A corporate HTTP_PROXY must not swallow a request to your own machine."""

    def _provider(self, base: str) -> LocalLLMTranslation:
        import os

        os.environ["VOXSWAP_LOCAL_LLM_BASE"] = base
        try:
            return LocalLLMTranslation()
        finally:
            os.environ.pop("VOXSWAP_LOCAL_LLM_BASE", None)

    def test_localhost_bypasses_the_proxy(self) -> None:
        for base in ("http://127.0.0.1:8080/v1", "http://localhost:11434/v1", "http://gpu-box.local:8080/v1"):
            self.assertTrue(self._provider(base)._is_local, base)

    def test_a_remote_host_still_uses_the_proxy(self) -> None:
        for base in ("https://api.example.com/v1", "http://10.0.0.5:8080/v1"):
            self.assertFalse(self._provider(base)._is_local, base)

    def test_it_really_reaches_a_local_server_with_a_proxy_set(self) -> None:
        import os

        previous = {k: os.environ.get(k) for k in ("HTTP_PROXY", "http_proxy")}
        os.environ["HTTP_PROXY"] = os.environ["http_proxy"] = "http://127.0.0.1:9/"   # a dead proxy
        try:
            with FakeServer(['["merhaba"]']) as server:
                provider = provider_for(server)
                self.assertEqual(provider.translate(["hello"], source="en", target="tr"), ["merhaba"])
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


class ParserTests(unittest.TestCase):
    def test_counts_must_match(self) -> None:
        self.assertIsNone(parse_string_array('["a"]', 2))
        self.assertEqual(parse_string_array('["a", "b"]', 2), ["a", "b"])

    def test_non_list_is_rejected(self) -> None:
        self.assertIsNone(parse_string_array('{"a": 1}', 1))

    def test_numbers_are_coerced_to_strings(self) -> None:
        self.assertEqual(parse_string_array("[1, 2]", 2), ["1", "2"])


if __name__ == "__main__":
    unittest.main()
