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
import os
import re
import urllib.parse

log = logging.getLogger("boxdrank.headshots")

# Wikimedia asks for a descriptive User-Agent identifying the app + contact.
_UA = "BoxdRank/1.0 (https://boxdrank.app; actor/director headshots)"
_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
_API = "https://en.wikipedia.org/w/api.php"
_WD_API = "https://www.wikidata.org/w/api.php"
_COMMONS_FILE = "https://commons.wikimedia.org/wiki/Special:FilePath/"

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


def _wikidata_image(q):
    """Last resort: Wikidata's image (P18). It's language-neutral, so it often
    has a photo for actors whose ENGLISH Wikipedia article has none (common for
    Japanese / world-cinema names). We still require the entity to be a human
    film person whose label matches the name, so a same-named civil servant or
    athlete doesn't slip through."""
    import requests
    r = requests.get(_WD_API, params={
        "action": "wbsearchentities", "search": q, "language": "en",
        "type": "item", "format": "json", "limit": 5,
    }, headers={"User-Agent": _UA}, timeout=8)
    if r.status_code != 200:
        return None
    for c in (r.json() or {}).get("search") or []:
        qid, label, desc = c.get("id"), c.get("label", ""), c.get("description", "")
        # Cheap pre-filters on the search hit before fetching full claims.
        if not qid or not _name_matches(q, label) or not _is_film_person(desc, label):
            continue
        e = requests.get(_WD_API, params={
            "action": "wbgetentities", "ids": qid, "props": "claims", "format": "json",
        }, headers={"User-Agent": _UA}, timeout=8)
        if e.status_code != 200:
            continue
        claims = (((e.json() or {}).get("entities") or {}).get(qid) or {}).get("claims") or {}
        instance_of = [cl.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
                       for cl in claims.get("P31", [])]
        if "Q5" not in instance_of:          # must be a human, not a film/character
            continue
        p18 = claims.get("P18")
        if p18:
            fn = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            if fn:
                return _COMMONS_FILE + urllib.parse.quote(fn) + "?width=300"
    return None


def _tmdb_image(q):
    """Final fallback: TMDB, which has a headshot for nearly every actor/director
    with film credits — including obscure world-cinema names Wikimedia lacks.
    Only runs if TMDB_API_KEY is set; TMDB's domain is film, so the top match for
    a name query is reliably the right person. Free key is fine for ad-supported
    use with a 'uses TMDB' credit."""
    key = os.environ.get("TMDB_API_KEY", "").strip()
    if not key:
        return None
    import requests
    r = requests.get("https://api.themoviedb.org/3/search/person", params={
        "api_key": key, "query": q, "include_adult": "false",
    }, headers={"User-Agent": _UA}, timeout=8)
    if r.status_code != 200:
        return None
    results = (r.json() or {}).get("results") or []
    results.sort(key=lambda x: x.get("popularity", 0), reverse=True)
    for p in results:
        path = p.get("profile_path")
        if path:
            return "https://image.tmdb.org/t/p/w300" + path
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
        url = (_direct_summary(q) or _search_fallback(q)
               or _wikidata_image(q) or _tmdb_image(q))
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
