"""
Person headshots — turn an actor/director name into a photo URL, free and with
no API key, using Wikipedia/Wikimedia.

Two-step lookup:
  1. Direct REST "summary" for the name. If it's a real (non-disambiguation)
     page about a film person and has a thumbnail, use it. Fast path for the
     famous, unambiguous names.
  2. If that misses (common cause: the name is a disambiguation page like
     "Kara Young" or "Michael Johnston"), fall back to a search that pulls
     candidate pages with their thumbnails + descriptions, and pick the first
     that is clearly a film person AND whose page title matches the name.

Either way we only use a photo when the page looks like the film person we mean,
so a same-named athlete/politician won't show the wrong face — we fall back to
initials instead. Names with no Wikipedia photo at all (e.g. some older actors)
also just keep initials.

Images come from Wikimedia Commons (mostly CC-BY-SA / public domain). Every name
is cached in SQLite (person_cache) so each person hits the network at most once;
'' is cached for "no usable image".
"""
import logging
import re
import urllib.parse

log = logging.getLogger("boxdrank.headshots")

# Wikimedia asks for a descriptive User-Agent identifying the app + contact.
_UA = "BoxdRank/1.0 (https://boxdrank.app; actor/director headshots)"
_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
_API = "https://en.wikipedia.org/w/api.php"

# The page must read as a film person for us to trust the photo is the right one.
_PERSON_HINTS = (
    "actor", "actress", "film", "director", "filmmaker", "producer",
    "screenwriter", "comedian", "performer", "voice", "animator",
    "cinema", "movie", "television", "playwright", "entertainer",
)


def _is_film_person(desc, title):
    """True if a short description or the title's parenthetical marks a film person."""
    if any(h in (desc or "").lower() for h in _PERSON_HINTS):
        return True
    m = re.search(r"\(([^)]+)\)", title or "")
    return bool(m and any(h in m.group(1).lower() for h in _PERSON_HINTS))


def _name_matches(query, title):
    """True if every meaningful token of the queried name appears in the page
    title — guards the search fallback against unrelated (e.g. film) pages."""
    toks = [t for t in re.findall(r"\w+", query.lower()) if len(t) > 1]
    tl = (title or "").lower()
    return bool(toks) and all(t in tl for t in toks)


def _direct_summary(q):
    import requests
    title = urllib.parse.quote(q.replace(" ", "_"), safe="")
    resp = requests.get(_SUMMARY + title, headers={"User-Agent": _UA}, timeout=8)
    if resp.status_code != 200:
        return None
    d = resp.json() or {}
    if d.get("type") == "disambiguation":
        return None
    blurb = (d.get("description") or "") + " " + (d.get("extract") or "")
    if _is_film_person(blurb, d.get("title")):
        return (d.get("thumbnail") or {}).get("source")
    return None


def _search_fallback(q):
    import requests
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": q, "gsrlimit": 6, "gsrnamespace": 0,
        "prop": "pageimages|description", "piprop": "thumbnail", "pithumbsize": 300,
    }
    resp = requests.get(_API, params=params, headers={"User-Agent": _UA}, timeout=8)
    if resp.status_code != 200:
        return None
    pages = ((resp.json() or {}).get("query") or {}).get("pages") or {}
    for p in sorted(pages.values(), key=lambda x: x.get("index", 999)):
        thumb = (p.get("thumbnail") or {}).get("source")
        if thumb and _is_film_person(p.get("description"), p.get("title")) \
                and _name_matches(q, p.get("title")):
            return thumb
    return None


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

    url = None
    try:
        url = _direct_summary(q) or _search_fallback(q)
    except Exception as e:
        # Transient failure — don't poison the cache, just bail for now.
        log.warning("wiki headshot lookup failed for %r: %s", q, e)
        return None

    # Cache the result, but never let a write lock (e.g. many parallel lookups
    # contending on the DB) break or slow the lookup — the URL is already in hand.
    try:
        leaderboard.person_cache_set(qlow, url or "")
    except Exception as e:
        log.warning("person_cache write skipped for %r: %s", q, e)
    return url
