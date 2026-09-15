"""Tiny HTTP client for provider adapters.

urllib, not requests: adapters must work in a bare `python3` with no pip
install. Adds the things a paid API actually needs — timeouts, retry with
backoff on 429/5xx, and error messages that quote the provider's own response
instead of hiding it behind a stack trace.
"""

from __future__ import annotations

import json
import mimetypes
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from ..errors import ProviderError

_RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504}


def _request(req: urllib.request.Request, *, provider: str, what: str, timeout: int, retries: int) -> bytes:
    delay = 2.0
    last = ""
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")[:600]
            last = f"HTTP {exc.code}: {body}"
            if exc.code in _RETRY_STATUS and attempt < retries:
                # honour Retry-After when the provider sends one
                wait = float(exc.headers.get("Retry-After") or 0) or delay
                time.sleep(wait)
                delay *= 2
                continue
            raise ProviderError(
                f"{provider} failed to {what}",
                _hint_for_status(exc.code, provider) + f" Response: {body}",
            ) from exc
        except urllib.error.URLError as exc:
            last = str(exc.reason)
            if attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise ProviderError(
                f"{provider} unreachable while trying to {what} ({last})",
                "Check the machine's network/proxy settings, then retry the job with --from <stage>.",
            ) from exc
    raise ProviderError(f"{provider} failed to {what}: {last}", "Retries exhausted.")


def _hint_for_status(code: int, provider: str) -> str:
    if code in (401, 403):
        return f"The {provider} API key is missing, wrong, or lacks permission for this call."
    if code == 402:
        return f"The {provider} account is out of credit."
    if code == 422:
        return "The request was rejected as invalid — usually an unsupported language or voice setting."
    if code == 429:
        return "Rate limited. Lower options.max_parallel in order.json."
    return "Provider-side error."


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str], *, provider: str, what: str,
              timeout: int = 120, retries: int = 3) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    raw = _request(req, provider=provider, what=what, timeout=timeout, retries=retries)
    return json.loads(raw.decode("utf-8", "replace") or "{}")


def post_binary(url: str, payload: dict[str, Any], headers: dict[str, str], *, provider: str, what: str,
                timeout: int = 300, retries: int = 3) -> bytes:
    """POST JSON, get raw bytes back (audio endpoints)."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    return _request(req, provider=provider, what=what, timeout=timeout, retries=retries)


def post_multipart(url: str, fields: dict[str, str], files: list[tuple[str, Path]], headers: dict[str, str],
                   *, provider: str, what: str, timeout: int = 600, retries: int = 2,
                   raw_response: bool = False) -> Any:
    """multipart/form-data upload — voice cloning and ASR both need it."""
    boundary = f"----voxswap{uuid.uuid4().hex}"
    body = bytearray()
    for key, value in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
        body += f"{value}\r\n".encode()
    for key, path in files:
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{key}"; filename="{path.name}"\r\n'.encode()
        body += f"Content-Type: {ctype}\r\n\r\n".encode()
        body += path.read_bytes()
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(url, data=bytes(body), method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}", **headers})
    raw = _request(req, provider=provider, what=what, timeout=timeout, retries=retries)
    if raw_response:
        return raw
    return json.loads(raw.decode("utf-8", "replace") or "{}")


def delete(url: str, headers: dict[str, str], *, provider: str, what: str, timeout: int = 60) -> None:
    req = urllib.request.Request(url, method="DELETE", headers=headers)
    _request(req, provider=provider, what=what, timeout=timeout, retries=1)
