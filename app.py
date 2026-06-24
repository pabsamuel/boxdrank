"""
BoxdRank - Letterboxd Rank Viewer
Flask web app — production-ready
"""
import os
import io
import time
import hashlib
import logging
import threading
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from flask import Flask, render_template, request, jsonify, send_file, make_response

from scraper import get_user_stats
from rank_engine import calculate_rank, RANK_COLORS, get_next_rank_info, get_rank_title
from image_generator import generate_rank_card
import leaderboard
import geo
import headshots

# Load .env (local secrets like TMDB_API_KEY) before reading any env vars. No-op
# if python-dotenv isn't installed or there's no .env — in prod the host sets
# the environment directly.
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
_SECRET = os.environ.get("SECRET_KEY", "")
app.config["SECRET_KEY"] = _SECRET or "dev-fallback-key"

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("boxdrank")

# Loud warning if a real secret isn't set outside debug (harmless today since we
# don't use Flask sessions, but a trap if cookie-based auth is ever added).
if not _SECRET and os.environ.get("FLASK_DEBUG", "").lower() not in ("1", "true"):
    log.warning("SECRET_KEY not set - using an insecure dev fallback. "
                "Set SECRET_KEY in the environment before exposing this publicly.")

# Initialize leaderboard database on startup
leaderboard.init_db()

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter (per-IP)
# ---------------------------------------------------------------------------
_rate_counts: dict = defaultdict(list)   # ip -> [timestamps]
_RATE_LIMIT = 20          # max requests per window
_RATE_WINDOW = 60         # seconds


def _is_rate_limited(ip: str) -> bool:
    """Return True if the IP has exceeded the rate limit."""
    now = time.time()
    timestamps = _rate_counts[ip]
    # Remove old entries
    _rate_counts[ip] = [t for t in timestamps if now - t < _RATE_WINDOW]
    if len(_rate_counts[ip]) >= _RATE_LIMIT:
        return True
    _rate_counts[ip].append(now)
    return False


def _safe_int(value, default: int) -> int:
    """Safely convert query param to int, returning default on failure."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _validate_username(username: str):
    """Validate username and return (clean_username, error_response) tuple."""
    if not username or len(username.strip()) < 1 or len(username.strip()) > 30:
        return None, (jsonify({"error": "Invalid username"}), 400)
    # Remove spaces entirely (Letterboxd doesn't have spaces in URLs)
    clean = username.strip().replace(" ", "").lower()
    if not all(c.isalnum() or c in "_-" for c in clean):
        return None, (jsonify({"error": "Username contains invalid characters"}), 400)
    if clean in ("null", "undefined", "none"):
        return None, (jsonify({"error": "Invalid username"}), 400)
    return clean, None


# ---------------------------------------------------------------------------
# Account ownership helpers — see leaderboard.claim_owner. A browser sends a
# random device key; we store only its hash. The first device to set a
# country / X handle claims the account; afterwards only that device can edit.
# ---------------------------------------------------------------------------
def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _valid_key(key) -> bool:
    return isinstance(key, str) and 8 <= len(key) <= 200 and all(
        c.isalnum() or c in "-_" for c in key)


def _authorize_owner(username: str, key: str):
    """Ensure this device key owns the account, claiming it if it's still
    unclaimed. Returns (ok: bool, error_tuple_or_None)."""
    info = leaderboard.get_owner_info(username)
    if info is None:
        return False, (jsonify({"error": "Look up your rank first."}), 404)
    key_hash = _hash_key(key)
    owner = info.get("owner_key")
    if owner is None:
        # Unclaimed — this device claims it (atomic; safe under a race).
        leaderboard.claim_owner(username, key_hash)
        info = leaderboard.get_owner_info(username)
        owner = info.get("owner_key") if info else None
    if owner != key_hash:
        return False, (jsonify({
            "error": "This account is already linked to another device.",
            "claimed": True,
        }), 403)
    return True, None


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    base = _public_base()
    return _index_response(_DEFAULT_OG_TITLE, _DEFAULT_OG_DESC,    # SPA — let frontend handle
                           f"{base}/static/boxdrank-logo.png", base + request.path)


@app.errorhandler(500)
def server_error(e):
    log.error("Internal server error: %s", e)
    return jsonify({"error": "Something went wrong. Please try again."}), 500


@app.errorhandler(429)
def rate_limited(e):
    return jsonify({"error": "Too many requests. Please slow down."}), 429


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
_INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "index.html")
_DEFAULT_OG_TITLE = "BoxdRank — What's your film rank?"
_DEFAULT_OG_DESC = "Iron to Challenger. Find your competitive Letterboxd rank and climb the global leaderboard."


def _public_base():
    """Absolute origin for building share / image URLs. BOXDRANK_DOMAIN wins in
    production (so links survive behind proxies); otherwise use the request."""
    dom = os.environ.get("BOXDRANK_DOMAIN", "").strip()
    if dom:
        if not dom.startswith("http"):
            dom = "https://" + dom
        return dom.rstrip("/")
    return request.url_root.rstrip("/")


def _social_meta(title, desc, image, url, w=None, h=None):
    """Build the Open Graph / Twitter card meta tags injected into the page head."""
    from html import escape
    tags = [
        '<meta property="og:type" content="website" />',
        f'<meta property="og:title" content="{escape(title)}" />',
        f'<meta property="og:description" content="{escape(desc)}" />',
        f'<meta property="og:image" content="{escape(image)}" />',
        f'<meta property="og:url" content="{escape(url)}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{escape(title)}" />',
        f'<meta name="twitter:description" content="{escape(desc)}" />',
        f'<meta name="twitter:image" content="{escape(image)}" />',
    ]
    if w and h:
        tags.append(f'<meta property="og:image:width" content="{int(w)}" />')
        tags.append(f'<meta property="og:image:height" content="{int(h)}" />')
    return "\n".join(tags)


def _index_response(title, desc, image, url, w=None, h=None):
    """Serve index.html (raw, to avoid Jinja conflicts with ${} in JS) with the
    social meta block injected at the <!--SOCIAL_META--> marker."""
    with open(_INDEX_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("<!--SOCIAL_META-->", _social_meta(title, desc, image, url, w, h), 1)
    response = make_response(content)
    response.headers["Content-Type"] = "text/html"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/")
def index():
    base = _public_base()
    return _index_response(_DEFAULT_OG_TITLE, _DEFAULT_OG_DESC,
                           f"{base}/static/boxdrank-logo.png", base + "/")


@app.route("/u/<username>")
def share_page(username):
    """Per-user share page — its og:image is the user's rank card, so pasting
    the link into X / Discord / iMessage renders their card."""
    clean, err = _validate_username(username)
    base = _public_base()
    if not clean:
        return _index_response(_DEFAULT_OG_TITLE, _DEFAULT_OG_DESC,
                               f"{base}/static/boxdrank-logo.png", base + "/")
    entry = leaderboard.get_user_position(clean)
    # Optional cache-buster: the share button appends ?v=<score>. X/Twitter caches
    # link cards by exact URL, so a poisoned old crawl (placeholder from when the
    # card was slow) sticks forever on the bare URL. Carrying the version through
    # to BOTH the page url and the image url forces a fresh crawl of the now-fast
    # card. The og:url canonical matches the crawled URL so X doesn't dedupe back
    # to the stale one.
    v = "".join(c for c in request.args.get("v", "") if c.isalnum())[:16]
    suffix = f"?v={v}" if v else ""
    image = f"{base}/api/card/{clean}{suffix}"
    share_url = f"{base}/u/{clean}{suffix}"
    if entry:
        tier = entry.get("tier", "") or ""
        div = entry.get("division", "") or ""
        title = f"@{clean} is {tier} {div}".strip() + " on BoxdRank"
        desc = (f"{entry.get('lp', 0)} LP · rank score {entry.get('score', 0)} — "
                "Iron to Challenger. What's your Letterboxd rank?")
    else:
        title = f"@{clean}'s rank on BoxdRank"
        desc = _DEFAULT_OG_DESC
    return _index_response(title, desc, image, share_url, 1200, 630)


@app.route("/health")
def health():
    """Health check endpoint for DigitalOcean / monitoring."""
    return jsonify({"status": "ok", "service": "boxdrank"})


# How long before a user's cached rank is re-scraped on lookup. Keeps ranks
# "live" as users log films, without hammering Letterboxd. Tunable via env.
_REFRESH_WINDOW = timedelta(minutes=int(os.environ.get("BOXDRANK_REFRESH_MIN", "10")))


def _is_stale(user_entry) -> bool:
    """True if the cached rank is older than the refresh window."""
    ts = user_entry.get("last_updated")
    if not ts:
        return True
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt) > _REFRESH_WINDOW
    except Exception:
        return True


def _stats_from_db_entry(user_entry):
    """Reconstruct a stats dict from a cached leaderboard row (no scrape)."""
    import json
    stats = {
        "films_watched": user_entry.get("films_watched", 0),
        "avg_rating": user_entry.get("avg_rating", 0.0),
        "reviews_count": user_entry.get("reviews_count", 0),
        "this_year_count": user_entry.get("this_year_count", 0),
        "lists_count": user_entry.get("lists_count", 0),
        "followers": user_entry.get("followers", 0),
        "x_handle": user_entry.get("x_handle"),
        "avatar_url": user_entry.get("avatar_url"),
        "country": user_entry.get("country"),
        "location": user_entry.get("location"),
    }
    taste_profile_json = user_entry.get("taste_profile")
    if taste_profile_json:
        try:
            tp = json.loads(taste_profile_json)
            stats["fav_genres"] = tp.get("fav_genres", [])
            stats["fav_directors"] = tp.get("fav_directors", [])
            stats["top_actors"] = tp.get("top_actors", [])
            stats["reviews"] = tp.get("reviews", [])
        except Exception:
            pass
    return stats


@app.route("/api/rank/<username>")
def api_rank(username):
    """API endpoint to get rank for a Letterboxd username."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    clean, err = _validate_username(username)
    if err:
        return err

    # CACHE PATH: serve the stored rank unless it's stale (so ranks stay "live"
    # and update as users log new films) — or unless ?cached=true is passed,
    # which is used for fast leaderboard browsing.
    force_cached = request.args.get("cached") == "true"
    force_refresh = request.args.get("refresh") == "true"
    user_entry = leaderboard.get_user_position(clean)
    if user_entry and not force_refresh and (force_cached or not _is_stale(user_entry)):
        stats_mock = _stats_from_db_entry(user_entry)
        rank_info_mock = calculate_rank(stats_mock)
        cpos = leaderboard.get_user_country_position(clean)
        return jsonify({
            "username": clean,
            "stats": stats_mock,
            "rank": rank_info_mock,
            "next_rank": get_next_rank_info(rank_info_mock),
            "rank_title": get_rank_title(rank_info_mock.get("score", 0)),
            "lb_position": user_entry.get("position"),
            "total_users": leaderboard.get_stats().get("total_users", 0),
            "country_position": cpos["country_position"] if cpos else None,
            "country_total": cpos["country_total"] if cpos else None,
            "country": cpos["country"] if cpos else stats_mock.get("country"),
            "location": stats_mock.get("location"),
            "cached": True
        })

    log.info("Rank lookup: %s%s", clean, " (forced refresh)" if force_refresh else "")
    stats = get_user_stats(clean, force=force_refresh)

    if stats is None:
        return jsonify({
            "error": "Could not fetch profile. Make sure the username is correct and the profile is public."
        }), 404

    if stats.get("films_watched", 0) == 0:
        return jsonify({
            "error": "No film data found. Is this a public Letterboxd profile?",
            "partial": stats,
        }), 404

    # Country comes from the profile's free-text location, geocoded to a
    # standard ISO-2 code. Objective + tamper-proof: there is no way for anyone
    # to set someone's country except by editing the real Letterboxd profile.
    location = (stats.get("location") or "").strip()
    stats["country"] = geo.location_to_country(location) if location else None

    rank_info = calculate_rank(stats)

    # Persist ranking to leaderboard
    leaderboard.save_ranking(clean, stats, rank_info)

    # Pre-render the share card now (off the request path) so it's already
    # cached on disk before the user clicks "Share on X" and the crawler hits it.
    threading.Thread(target=_prewarm_card, args=(clean,), daemon=True).start()

    # Enrich response with progression info and title
    next_rank = get_next_rank_info(rank_info)
    rank_title = get_rank_title(rank_info.get("score", 0))

    user_entry = leaderboard.get_user_position(clean)
    lb_position = None
    total_users = 0
    if user_entry:
        if user_entry.get("x_handle"):
            stats["x_handle"] = user_entry["x_handle"]
        if user_entry.get("position"):
            lb_position = user_entry["position"]
            total_users = leaderboard.get_stats().get("total_users", 0)

    cpos = leaderboard.get_user_country_position(clean)
    return jsonify({
        "username": clean,
        "stats": stats,
        "rank": rank_info,
        "next_rank": next_rank,
        "rank_title": rank_title,
        "lb_position": lb_position,
        "total_users": total_users,
        "country_position": cpos["country_position"] if cpos else None,
        "country_total": cpos["country_total"] if cpos else None,
        "country": cpos["country"] if cpos else stats.get("country"),
        "location": stats.get("location"),
    })


# --- Rank-card cache -------------------------------------------------------
# A slow card image is the #1 reason X/Twitter falls back to a placeholder
# thumbnail instead of the big card, so we cache the rendered PNG aggressively:
#   L1: per-worker memory dict (instant)
#   L2: a PNG on the data volume, shared across gunicorn workers + persisted
#       across restarts (so even the first crawl after a deploy is fast)
# Both are versioned on the row's last_updated, so a Refresh that changes the
# stats automatically supersedes the old card. Cards are also pre-warmed in the
# background the moment a user looks up their rank (see api_rank), so the image
# is already on disk before they hit "Share on X".
_CARD_DIR = os.path.join(
    os.path.dirname(os.environ.get("BOXDRANK_DB_PATH", "boxdrank.db")) or ".", "cards")
try:
    os.makedirs(_CARD_DIR, exist_ok=True)
except Exception as e:  # pragma: no cover
    log.warning("could not create card cache dir %s: %s", _CARD_DIR, e)

_card_mem = {}            # (username, style) -> (version, png_bytes)
_CARD_MEM_MAX = 128


def _safe_ver(v):
    return "".join(c if c.isalnum() else "-" for c in str(v or "0"))[:40]


def _card_disk_path(clean, style, version):
    return os.path.join(_CARD_DIR, f"{clean}__{style}__{_safe_ver(version)}.png")


def _card_disk_write(clean, style, version, data):
    """Persist the PNG (atomically) and drop stale versions for this user/style."""
    try:
        os.makedirs(_CARD_DIR, exist_ok=True)
        path = _card_disk_path(clean, style, version)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        keep = os.path.basename(path)
        prefix = f"{clean}__{style}__"
        for fn in os.listdir(_CARD_DIR):
            if fn.startswith(prefix) and fn != keep:
                try:
                    os.remove(os.path.join(_CARD_DIR, fn))
                except Exception:
                    pass
    except Exception as e:
        log.debug("card disk write failed for %s: %s", clean, e)


def _card_bytes(clean, style):
    """Return the card PNG bytes for a user (L1 mem -> L2 disk -> render), or
    None if the profile has no usable data. Safe to call from any thread."""
    user_entry = leaderboard.get_user_position(clean)
    if user_entry:
        lb_position = user_entry.get("position")
        lb_total = leaderboard.get_stats().get("total_users", 0)
        # Version on last_updated AND the live standing (position + total). The
        # card prints the user's global rank, which moves when OTHER people pass
        # them — and that doesn't touch this user's last_updated — so positioning
        # alone in the key keeps the cached card honest.
        version = f"{user_entry.get('last_updated') or ''}|{lb_position or 0}|{lb_total}"
    else:
        lb_position = None
        lb_total = 0
        version = ""
    key = (clean, style)

    if version:
        item = _card_mem.get(key)
        if item and item[0] == version:
            return item[1]
        try:
            with open(_card_disk_path(clean, style, version), "rb") as f:
                data = f.read()
            _card_mem[key] = (version, data)
            return data
        except Exception:
            pass  # not on disk yet — render below

    if user_entry:
        stats = _stats_from_db_entry(user_entry)
    else:
        stats = get_user_stats(clean)
        if stats is None or stats.get("films_watched", 0) == 0:
            return None

    rank_info = calculate_rank(stats)
    img = generate_rank_card(clean, stats, rank_info, lb_position=lb_position,
                             lb_total=lb_total, style=style)
    bio = io.BytesIO()
    img.save(bio, "PNG", optimize=True)
    data = bio.getvalue()

    if version:
        if len(_card_mem) >= _CARD_MEM_MAX:
            _card_mem.clear()
        _card_mem[key] = (version, data)
        _card_disk_write(clean, style, version, data)
    return data


def _prewarm_card(clean):
    """Render + cache the default share card off the request path."""
    try:
        _card_bytes(clean, "code")
    except Exception as e:
        log.debug("card prewarm failed for %s: %s", clean, e)


@app.route("/api/card/<username>")
def api_card(username):
    """Generate and return a rank card image (served from cache when possible)."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests."}), 429

    clean, err = _validate_username(username)
    if err:
        return err

    style = "canva" if request.args.get("style") == "canva" else "code"
    data = _card_bytes(clean, style)
    if data is None:
        return jsonify({"error": "Could not fetch data"}), 404

    resp = send_file(io.BytesIO(data), mimetype="image/png")
    if request.args.get("v"):
        # Versioned share URL (?v=score-lp-pos): the content is immutable for
        # that exact standing, so let X / CDNs cache it hard.
        resp.headers["Cache-Control"] = "public, max-age=86400, immutable"
    else:
        # Bare URL: the card's global rank shifts as other people update, so it
        # must never be served stale from a browser cache.
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


@app.route("/api/leaderboard")
def api_leaderboard():
    """Paginated leaderboard sorted by score descending."""
    limit = min(_safe_int(request.args.get("limit"), 50), 100)
    offset = max(_safe_int(request.args.get("offset"), 0), 0)
    tier_filter = request.args.get("tier", None)
    country_filter = request.args.get("country", None)

    # Validate tier filter against known tiers
    valid_tiers = {
        "Iron", "Bronze", "Silver", "Gold", "Platinum",
        "Emerald", "Diamond", "Master", "Grandmaster", "Challenger",
    }
    if tier_filter and tier_filter not in valid_tiers:
        tier_filter = None

    entries = leaderboard.get_leaderboard_by_country(country_filter, limit, offset) if country_filter else leaderboard.get_leaderboard(limit=limit, offset=offset, tier_filter=tier_filter)
    stats = leaderboard.get_stats()

    resp = make_response(jsonify({
        "leaderboard": entries,
        "user_count": stats["total_users"],
        "rank_distribution": stats["rank_distribution"],
    }))
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.route("/api/leaderboard/search")
def api_leaderboard_search():
    """Search leaderboard usernames."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Missing search query parameter 'q'"}), 400
    if len(query) > 30:
        return jsonify({"error": "Search query too long"}), 400

    results = leaderboard.search_leaderboard(query)
    return jsonify({"results": results})


@app.route("/api/leaderboard/stats")
def api_leaderboard_stats():
    """Return aggregate leaderboard statistics."""
    stats = leaderboard.get_stats()
    resp = make_response(jsonify(stats))
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.route("/api/people-images", methods=["POST"])
def api_people_images():
    """Batch-resolve TMDB headshots for a list of actor/director names.
    Returns {name: url_or_null}. Cached per-name in the DB, so repeat views are
    free; with no TMDB_API_KEY set, every value is null (graceful no-op)."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests."}), 429
    data = request.get_json(silent=True) or {}
    names = data.get("names") or []
    if not isinstance(names, list):
        return jsonify({"error": "names must be a list"}), 400
    valid = [n for n in names[:30] if isinstance(n, str) and n.strip()]
    out = {}
    if valid:
        # Lookups are network-bound (Wikipedia); resolve them in parallel so a
        # cold board fills in a couple of seconds instead of ~20s sequentially.
        # Cached names return instantly, so warm loads are cheap regardless.
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            for name, img in zip(valid, ex.map(headshots.person_image, valid)):
                out[name] = img
    return jsonify({"images": out})


# Actor / director leaderboards are aggregated from every stored taste profile.
# That scan + the TMDB image resolve is cheap but not free, so cache the built
# payload briefly — the board doesn't change second-to-second.
_people_lb_cache: dict = {}            # kind -> (built_at, payload)
_PEOPLE_LB_TTL = 120                   # seconds


@app.route("/api/leaderboard/people/<kind>")
def api_people_leaderboard(kind):
    """Popularity leaderboard for 'actors' or 'directors' (with headshots)."""
    if kind not in ("actors", "directors"):
        return jsonify({"error": "Unknown leaderboard"}), 404
    now = time.time()
    cached = _people_lb_cache.get(kind)
    if cached and now - cached[0] < _PEOPLE_LB_TTL:
        return jsonify(cached[1])
    limit = min(_safe_int(request.args.get("limit"), 25), 50)
    people = leaderboard.get_people_leaderboard(kind, limit=limit)
    # Headshots are filled in lazily by the client (via /api/people-images) so
    # this board renders instantly with initials and photos fade in after.
    payload = {"kind": kind, "people": people}
    _people_lb_cache[kind] = (now, payload)
    return jsonify(payload)


@app.route("/api/connect-x", methods=["POST"])
def api_connect_x():
    """Link an X (Twitter) handle to a Letterboxd username."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests."}), 429

    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    username = data.get("username", "").strip().lower()
    x_handle = data.get("x_handle", "").strip().lstrip("@")
    key = data.get("key", "")

    if not username or not x_handle:
        return jsonify({"error": "Both 'username' and 'x_handle' are required"}), 400

    if not all(c.isalnum() or c in "_-" for c in username):
        return jsonify({"error": "Invalid username"}), 400

    if not all(c.isalnum() or c == "_" for c in x_handle):
        return jsonify({"error": "Invalid X handle"}), 400

    if len(x_handle) > 15:
        return jsonify({"error": "X handle too long"}), 400

    if not _valid_key(key):
        return jsonify({"error": "Missing or invalid device key"}), 400

    # Must exist in the leaderboard AND be owned by this device (claims if
    # still unclaimed) — you can't link X to someone else's account.
    ok, err = _authorize_owner(username, key)
    if not ok:
        return err

    # One X handle = one rank. Block linking it to a second account.
    existing = leaderboard.get_username_by_x_handle(x_handle)
    if existing and existing != username:
        return jsonify({
            "error": f"@{x_handle} is already linked to another rank (@{existing})."
        }), 409

    leaderboard.update_x_handle(username, x_handle)
    log.info("X linked: %s -> @%s", username, x_handle)
    return jsonify({"ok": True, "username": username, "x_handle": x_handle})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

# NOTE: there is intentionally no endpoint to set a country. Country is derived
# only from the scraped Letterboxd location (see /api/rank), so it can't be
# spoofed for yourself or anyone else.


# ---------------------------------------------------------------------------
# Background refresher — keeps the leaderboard "alive": quietly re-scrapes the
# most out-of-date profiles on a rotation, so ranks update as users log films /
# reviews even if they never reopen the site. Throttled to stay gentle on
# Letterboxd. Tunable / disable via env (BOXDRANK_BG_REFRESH=0).
# ---------------------------------------------------------------------------
_BG_ENABLED = os.environ.get("BOXDRANK_BG_REFRESH", "0") != "0"   # OFF in this version (users re-search to update)
_BG_INTERVAL = int(os.environ.get("BOXDRANK_BG_INTERVAL_SEC", "180"))   # seconds between cycles
_BG_BATCH = int(os.environ.get("BOXDRANK_BG_BATCH", "4"))               # profiles refreshed per cycle


def _background_refresher():
    log.info("Background refresher on: %d profiles every %ds", _BG_BATCH, _BG_INTERVAL)
    while True:
        time.sleep(_BG_INTERVAL)
        try:
            for u in leaderboard.get_oldest_usernames(_BG_BATCH):
                try:
                    stats = get_user_stats(u, force=True)
                    if stats and stats.get("films_watched", 0) > 0:
                        rank_info = calculate_rank(stats)
                        leaderboard.save_ranking(u, stats, rank_info)
                        log.info("bg-refresh: %s -> %s %s (%d)", u,
                                 rank_info["tier"], rank_info["division"], rank_info["score"])
                except Exception as e:
                    log.warning("bg-refresh failed for %s: %s", u, e)
        except Exception as e:
            log.warning("bg-refresher cycle error: %s", e)


if _BG_ENABLED:
    threading.Thread(target=_background_refresher, daemon=True, name="bg-refresher").start()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)