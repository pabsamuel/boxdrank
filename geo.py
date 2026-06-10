"""
Geocoding — turn a free-text Letterboxd location ("london", "lexington, ky")
into a standardized ISO-2 country code ("GB", "US").

Uses OpenStreetMap's Nominatim (free) via geopy. Two things keep us inside
Nominatim's usage policy and fast:
  * a persistent per-string cache in SQLite (the same location text repeats a
    LOT across users, so we rarely hit the network), and
  * a 1 req/sec rate limiter on the rare cache miss.

All failures are swallowed and return None — geocoding never blocks a rank
lookup, it just means "no country detected".
"""
import logging
import threading

log = logging.getLogger("boxdrank.geo")

_lock = threading.Lock()
_rate_geocode = None   # lazily-built rate-limited geocode callable


def _get_geocode():
    """Lazily build the Nominatim geocoder (so the app boots even if geopy is
    missing / offline). Returns a rate-limited callable, or None on failure."""
    global _rate_geocode
    if _rate_geocode is not None:
        return _rate_geocode
    try:
        from geopy.geocoders import Nominatim
        from geopy.extra.rate_limiter import RateLimiter
        geocoder = Nominatim(user_agent="boxdrank/1.0 (+https://boxdrank.app)", timeout=8)
        _rate_geocode = RateLimiter(
            geocoder.geocode, min_delay_seconds=1,
            max_retries=1, swallow_exceptions=True,
        )
    except Exception as e:   # geopy not installed, etc.
        log.warning("geocoder unavailable: %s", e)
        _rate_geocode = None
    return _rate_geocode


def location_to_country(location):
    """Return an ISO-2 country code (upper) for a free-text location, or None
    if it can't be resolved (blank, gibberish, or a lookup failure)."""
    if not location:
        return None
    q = " ".join(str(location).strip().split())
    if len(q) < 2 or len(q) > 120:
        return None

    import leaderboard
    qlow = q.lower()
    cached = leaderboard.geocode_cache_get(qlow)
    if cached is not None:          # a row exists ('' means "resolved to nothing")
        return cached or None

    country = None
    try:
        with _lock:                 # serialize calls to respect the rate limit
            geocode = _get_geocode()
            loc = geocode(q, addressdetails=True, language="en") if geocode else None
        if loc is not None:
            cc = (getattr(loc, "raw", {}) or {}).get("address", {}).get("country_code")
            if cc and len(cc) == 2 and cc.isalpha():
                country = cc.upper()
    except Exception as e:
        # Transient failure (network/limit) — don't poison the cache, just bail.
        log.warning("geocode failed for %r: %s", q, e)
        return None

    leaderboard.geocode_cache_set(qlow, country or "")
    return country
