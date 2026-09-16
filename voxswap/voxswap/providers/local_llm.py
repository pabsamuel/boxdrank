"""Translation on your own machine, through any OpenAI-compatible local server.

One adapter covers llama.cpp's `llama-server`, Ollama, LM Studio, vLLM,
text-generation-webui and anything else that speaks `/v1/chat/completions` —
because they all converged on the same endpoint. Point it at a GGUF model you
are already running and translation costs nothing and leaves no machine.

    # llama.cpp
    llama-server -m models/qwen3-14b-instruct-q5_k_m.gguf -c 8192 --port 8080
    VOXSWAP_LOCAL_LLM_BASE=http://127.0.0.1:8080/v1

    # Ollama
    VOXSWAP_LOCAL_LLM_BASE=http://127.0.0.1:11434/v1
    VOXSWAP_LOCAL_LLM_MODEL=qwen3:14b

Two things differ from a hosted model, and both are handled here rather than
left as a surprise:

  * **Smaller batches.** A 7-14B model loses count on a 40-line list far more
    readily than a frontier model, and a miscounted batch costs a retry. The
    default is 12; `dubbing.py` still retries and then falls back to one line at
    a time, so a weak model degrades in speed rather than in correctness.
  * **Long timeouts.** CPU-only generation is slow. The default timeout is 10
    minutes per request, not 2.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

from ..errors import ProviderError
from .dubbing import DubbingTranslator
from .http import post_json

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


class LocalLLMTranslation(DubbingTranslator):
    name = "local_llm"

    def __init__(self) -> None:
        self.base = os.environ.get("VOXSWAP_LOCAL_LLM_BASE", "http://127.0.0.1:8080/v1").rstrip("/")
        # llama-server ignores the model name; Ollama and LM Studio need a real one.
        self.model = os.environ.get("VOXSWAP_LOCAL_LLM_MODEL", "local-model")
        self.timeout = int(os.environ.get("VOXSWAP_LOCAL_LLM_TIMEOUT", "600"))
        self.batch_size = max(1, int(os.environ.get("VOXSWAP_LOCAL_LLM_BATCH", "12")))
        self.max_tokens = int(os.environ.get("VOXSWAP_LOCAL_LLM_MAX_TOKENS", "4096"))
        self.api_key = os.environ.get("VOXSWAP_LOCAL_LLM_KEY", "")

    @property
    def _is_local(self) -> bool:
        """A corporate HTTP_PROXY must not swallow a request to your own box.

        urllib honours proxy environment variables by default, so without this
        an operator behind a proxy gets a baffling failure talking to a server
        running on the same machine.
        """
        host = (urlparse(self.base).hostname or "").lower()
        return host in _LOCAL_HOSTS or host.endswith(".local")

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.api_key:                                 # some servers want any bearer token
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _ask(self, system: str, user: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,        # translation wants consistency, not flair
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        data = post_json(
            f"{self.base}/chat/completions",
            payload,
            self._headers(),
            provider=f"local_llm ({self.base})",
            what="translate a batch",
            timeout=self.timeout,
            retries=1,                 # a local server that is down stays down; do not sit retrying
            bypass_proxy=self._is_local,
        )

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                f"{self.base} returned a response VoxSwap could not read",
                "The server must be OpenAI-compatible (/v1/chat/completions). "
                f"Got: {str(data)[:200]}",
            ) from exc
        if content is None:
            raise ProviderError(
                f"{self.base} returned an empty message",
                "The model may have hit its context limit — lower VOXSWAP_LOCAL_LLM_BATCH.",
            )
        return str(content).strip()

    def describe(self) -> str:
        return f"local_llm({self.model} @ {self.base}, batch={self.batch_size})"
