"""
Person headshots — turn an actor/director name into a photo URL, free and with
no API key, using Wikipedia/Wikimedia.

We hit Wikipedia's REST "summary" endpoint for the name. It returns a thumbnail
plus a short description/extract, which we use to sanity-check that the page is
actually a film person (so "Michael Johnston" resolves to the actor, not the
footballer). If it isn't clearly a film person, we return no image rather than
risk showing the wrong face.

Images come from Wikimedia Commons; most are CC-BY-SA / public domain. For a
commercial site a small "photos via Wikimedia" credit keeps you clean.

Like geo.py, every name is cached in SQLite (person_cache) so each person hits
the network at most once; '' is cached for "no usable image".
"""
import logging
import urllib.parse

log = logging.getLogger("boxdrank.headshots")

# Wikimedia asks for a descriptive User-Agent identifying the app + contact.
_UA = "BoxdRank/1.0 (https://boxdrank.app; actor/director headshots)"
_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"

# The page's description/extract must mention one of these for us to trust that
# the photo is the film person we mean (and not a same-named athlete/politician).
_PERSON_HINTS = (
    "actor", "actress", "film", "director", "filmmaker", "producer",
    "screenwriter", "comedian", "performer", "voice", "animator",
    "cinema", "movie", "television", "playwright", "entertainer",
)


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
        import requests
        title = urllib.parse.quote(q.replace(" ", "_"), safe="")
        resp = requests.get(_SUMMARY + title, headers={"User-Agent": _UA}, timeout=8)
        if resp.status_code == 200:
            d = resp.json() or {}
            if d.get("type") != "disambiguation":
                blurb = ((d.get("description") or "") + " " + (d.get("extract") or "")).lower()
                if any(h in blurb for h in _PERSON_HINTS):
                    thumb = (d.get("thumbnail") or {}).get("source")
                    if thumb:
                        url = thumb
    except Exception as e:
        # Transient failure — don't poison the cache, just bail for now.
        log.warning("wiki headshot lookup failed for %r: %s", q, e)
        return None

    leaderboard.person_cache_set(qlow, url or "")
    return url
