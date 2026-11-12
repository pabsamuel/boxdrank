"""Bounded parallelism for provider calls.

Transcription and synthesis are network-bound: one line at a time wastes hours
on a big job. But providers rate-limit, and a stampede turns into 429s and a
half-finished order, so concurrency is capped by `options.max_parallel` and
every failure is captured per item instead of killing the batch.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Iterable, TypeVar

T = TypeVar("T")
R = TypeVar("R")


def map_workers(
    items: Iterable[T],
    fn: Callable[[T], R],
    *,
    workers: int = 4,
    on_done: Callable[[T, R], None] | None = None,
    on_error: Callable[[T, Exception], None] | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> tuple[int, int]:
    """Run `fn` over `items`. Returns (succeeded, failed).

    Results are handed to `on_done` on the calling thread, so callers can mutate
    shared state without locking.
    """
    work = list(items)
    if not work:
        return 0, 0
    workers = max(1, min(workers, len(work)))

    succeeded = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fn, item): item for item in work}
        for done, future in enumerate(as_completed(futures), start=1):
            item = futures[future]
            try:
                result = future.result()
            except Exception as exc:                     # noqa: BLE001 - reported per item, batch continues
                failed += 1
                if on_error:
                    on_error(item, exc)
            else:
                succeeded += 1
                if on_done:
                    on_done(item, result)
            if progress:
                progress(done, len(work))
    return succeeded, failed
