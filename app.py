"""
BoxdRank - Letterboxd Rank Viewer
Flask web app — production-ready
"""
import os
import io
import time
import logging
import threading
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from flask import Flask, render_template, request, jsonify, send_file, make_response

from scraper import get_user_stats
from rank_engine import calculate_rank, RANK_COLORS, get_next_rank_info, get_rank_title
from image_generator import generate_rank_card
import leaderboard

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-fallback-key")

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("boxdrank")

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
    return clean, None


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
    return render_template("index.html"), 200   # SPA — let frontend handle


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
@app.route("/")
def index():
    """Serve raw HTML to avoid Jinja2 conflicts with {{ }} in JavaScript."""
    html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
    response = make_response(content)
    response.headers["Content-Type"] = "text/html"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


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

    rank_info = calculate_rank(stats)

    # Persist ranking to leaderboard
    leaderboard.save_ranking(clean, stats, rank_info)

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
    })


@app.route("/api/card/<username>")
def api_card(username):
    """Generate and return a rank card image."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests."}), 429

    clean, err = _validate_username(username)
    if err:
        return err

    # DB cache first — avoid a fresh scrape for the common case (the user just
    # looked up their rank, so they're already persisted).
    user_entry = leaderboard.get_user_position(clean)
    if user_entry:
        stats = _stats_from_db_entry(user_entry)
        lb_position = user_entry.get("position")
        lb_total = leaderboard.get_stats().get("total_users", 0)
    else:
        stats = get_user_stats(clean)
        if stats is None or stats.get("films_watched", 0) == 0:
            return jsonify({"error": "Could not fetch data"}), 404
        lb_position = None
        lb_total = 0

    rank_info = calculate_rank(stats)
    img = generate_rank_card(clean, stats, rank_info, lb_position=lb_position, lb_total=lb_total)

    img_io = io.BytesIO()
    img.save(img_io, "PNG", optimize=True)
    img_io.seek(0)

    return send_file(img_io, mimetype="image/png")


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

    if not username or not x_handle:
        return jsonify({"error": "Both 'username' and 'x_handle' are required"}), 400

    if not all(c.isalnum() or c in "_-" for c in username):
        return jsonify({"error": "Invalid username"}), 400

    if not all(c.isalnum() or c == "_" for c in x_handle):
        return jsonify({"error": "Invalid X handle"}), 400

    if len(x_handle) > 15:
        return jsonify({"error": "X handle too long"}), 400

    # Only allow linking if user exists in leaderboard (they must check rank first)
    user_entry = leaderboard.get_user_position(username)
    if not user_entry:
        return jsonify({"error": "Check your rank first before linking X"}), 400

    leaderboard.update_x_handle(username, x_handle)
    log.info("X linked: %s -> @%s", username, x_handle)
    return jsonify({"ok": True, "username": username, "x_handle": x_handle})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

@app.route("/api/country", methods=["POST"])
def api_set_country():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400
    username = data.get("username", "").strip().lower()
    country = data.get("country", "").strip()
    if not username or not country:
        return jsonify({"error": "Both 'username' and 'country' are required"}), 400
    leaderboard.update_country(username, country)
    log.info("Country set: %s -> %s", username, country)
    return jsonify({"ok": True, "username": username, "country": country})


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