"""
BoxdRank - Letterboxd Rank Viewer
Flask web app — production-ready
"""
import os
import io
import time
import logging
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


@app.route("/api/rank/<username>")
def api_rank(username):
    """API endpoint to get rank for a Letterboxd username."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    clean, err = _validate_username(username)
    if err:
        return err

    log.info("Rank lookup: %s", clean)
    stats = get_user_stats(clean)

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

    return jsonify({
        "username": clean,
        "stats": stats,
        "rank": rank_info,
        "next_rank": next_rank,
        "rank_title": rank_title,
        "lb_position": lb_position,
        "total_users": total_users,
    })


@app.route("/api/card/<username>")
def api_card(username):
    """Generate and return a rank card image."""
    if _is_rate_limited(request.remote_addr):
        return jsonify({"error": "Too many requests."}), 429

    clean, err = _validate_username(username)
    if err:
        return err

    stats = get_user_stats(clean)
    if stats is None or stats.get("films_watched", 0) == 0:
        return jsonify({"error": "Could not fetch data"}), 404

    rank_info = calculate_rank(stats)
    img = generate_rank_card(clean, stats, rank_info)

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

    return jsonify({
        "leaderboard": entries,
        "user_count": stats["total_users"],
        "rank_distribution": stats["rank_distribution"],
    })


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
    return jsonify(stats)


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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)