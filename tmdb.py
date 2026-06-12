"""
TMDB person images — turn an actor/director name into a headshot URL.

Uses The Movie Database (themoviedb.org) free API. Set TMDB_API_KEY in the
environment (a v3 API key from your TMDB account). Without it, every lookup
returns None gracefully, so the app runs fine — you just don't get photos until
the key is added.

Like geo.py, results are cached per-name in SQLite (person_cache), so each
actor/director hits the network at most once. '' is cached for "no image found"
so we don't re-query misses.
"""
import os
import logging
import threading

log = logging.getLogger("boxdrank.tmdb")

_lock = threading.Lock()
_IMG_BASE = "https://image.tmdb.org/t/p/w185"   # 185px headshots — plenty for chips
_SEARCH = "https://api.themoviedb.org/3/search/person"


def _api_key():
    return os.environ.get("TMDB_API_KEY", "").strip()


def person_image(name):
    """Return a headshot URL for a person's name, or None. Cached in SQLite."""
    if not name:
        return None
    q = " ".join(str(name).strip().split())
    if len(q) < 2 or len(q) > 80:
        return None

    import leaderboard
    qlow = q.lower()
    cached = leaderboard.person_cache_get(qlow)
    if cached is not None:            # row exists ('' means "looked up, no image")
        return cached or None

    key = _api_key()
    if not key:                       # no key configured — don't cache, just skip
        return None

    url = None
    try:
        import requests
        with _lock:                   # be gentle; TMDB allows bursts but this is plenty
            resp = requests.get(_SEARCH, params={
                "api_key": key, "query": q, "include_adult": "false",
            }, timeout=8)
        if resp.status_code == 200:
            results = (resp.json() or {}).get("results") or []
            # Prefer the most popular match with an actual photo.
            results.sort(key=lambda r: r.get("popularity", 0), reverse=True)
            for r in results:
                path = r.get("profile_path")
                if path:
                    url = _IMG_BASE + path
                    break
    except Exception as e:
        # Transient failure — don't poison the cache, just bail for now.
        log.warning("tmdb lookup failed for %r: %s", q, e)
        return None

    leaderboard.person_cache_set(qlow, url or "")
    return url
