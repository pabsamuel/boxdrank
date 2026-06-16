"""
Leaderboard Module - SQLite-based persistent leaderboard for BoxdRank.
"""
import sqlite3
import threading
import os
import json
from typing import Optional, Dict, List
from datetime import datetime, timezone

DB_PATH = os.environ.get("BOXDRANK_DB_PATH") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "boxdrank.db")
_db_lock = threading.Lock()

def _get_connection() -> sqlite3.Connection:
    # timeout = wait on a locked DB (safe with multiple gunicorn workers);
    # WAL lets readers + the writer run at once without "database is locked".
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=15000")
    except sqlite3.OperationalError:
        pass
    return conn

def init_db() -> None:
    with _db_lock:
        conn = _get_connection()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rankings (
                    username        TEXT PRIMARY KEY,
                    score           INTEGER NOT NULL,
                    tier            TEXT NOT NULL,
                    division        TEXT NOT NULL,
                    lp              INTEGER NOT NULL,
                    films_watched   INTEGER DEFAULT 0,
                    avg_rating      REAL    DEFAULT 0.0,
                    reviews_count   INTEGER DEFAULT 0,
                    lists_count     INTEGER DEFAULT 0,
                    followers       INTEGER DEFAULT 0,
                    this_year_count INTEGER DEFAULT 0,
                    x_handle        TEXT DEFAULT NULL,
                    avatar_url      TEXT DEFAULT NULL,
                    country         TEXT DEFAULT NULL,
                    location        TEXT DEFAULT NULL,
                    owner_key       TEXT DEFAULT NULL,
                    created_at      TEXT NOT NULL DEFAULT '',
                    last_updated    TEXT NOT NULL
                )
            """)
            try:
                conn.execute("ALTER TABLE rankings ADD COLUMN avatar_url TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute("ALTER TABLE rankings ADD COLUMN country TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute("ALTER TABLE rankings ADD COLUMN taste_profile TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            try:
                # owner_key: a hash of the device key that "claimed" this account.
                # Once set, only that device may change the account's X handle.
                conn.execute("ALTER TABLE rankings ADD COLUMN owner_key TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            try:
                # location: the raw free-text location scraped from the profile
                # (the country is derived from it by geocoding).
                conn.execute("ALTER TABLE rankings ADD COLUMN location TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rankings_score ON rankings (score DESC)")
            # Persistent geocoding cache: free-text location -> ISO-2 country
            # ('' = resolved to no country). Keeps us well within Nominatim limits.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS geocode_cache (
                    q       TEXT PRIMARY KEY,
                    country TEXT
                )
            """)
            # Persistent TMDB headshot cache: lower(name) -> image URL
            # ('' = looked up, no image). Keeps each person to one TMDB call.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS person_cache (
                    name  TEXT PRIMARY KEY,
                    image TEXT
                )
            """)
            conn.commit()
        finally:
            conn.close()

def save_ranking(username: str, stats: Dict, rank_info: Dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    # Serialize taste profile to JSON
    taste_profile = json.dumps({
        "fav_genres": stats.get("fav_genres", []),
        "fav_directors": stats.get("fav_directors", []),
        "top_actors": stats.get("top_actors", []),
        "actor_ratings": stats.get("actor_ratings", {}),
        "director_ratings": stats.get("director_ratings", {}),
        "reviews": stats.get("reviews", [])
    })
    with _db_lock:
        conn = _get_connection()
        try:
            # Check if user exists to preserve created_at / claim / last-known country
            row = conn.execute("SELECT created_at, country, location, owner_key, x_handle FROM rankings WHERE username = ?", (username.lower(),)).fetchone()
            created_at = row["created_at"] if row and row["created_at"] else now
            prev_country = row["country"] if row and "country" in row.keys() else None
            prev_location = row["location"] if row and "location" in row.keys() else None
            owner_key = row["owner_key"] if row and "owner_key" in row.keys() else None
            x_handle = row["x_handle"] if row and "x_handle" in row.keys() else None

            # Country is derived from the scraped location (see geo.location_to_country,
            # done by the caller and passed in stats["country"]). Keep the previous
            # value if this scrape didn't resolve one, so a transient geocode miss
            # never wipes a known-good country.
            location = stats.get("location") if stats.get("location") is not None else prev_location
            country = stats.get("country") or prev_country

            conn.execute("""
                INSERT OR REPLACE INTO rankings (
                    username, score, tier, division, lp,
                    films_watched, avg_rating, reviews_count, lists_count, followers,
                    this_year_count, avatar_url, country, location, owner_key, x_handle, taste_profile, created_at, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                username.lower(),
                rank_info.get("score", 0),
                rank_info.get("tier", "Iron"),
                rank_info.get("division", "IV"),
                rank_info.get("lp", 0),
                stats.get("films_watched", 0),
                stats.get("avg_rating", 0.0),
                stats.get("reviews_count", 0),
                stats.get("lists_count", 0),
                stats.get("followers", 0),
                stats.get("this_year_count", 0),
                stats.get("avatar_url", ""),
                country,
                location,
                owner_key,
                x_handle,
                taste_profile,
                created_at,
                now
            ))
            conn.commit()
        finally:
            conn.close()

def update_x_handle(username: str, x_handle: str) -> None:
    with _db_lock:
        conn = _get_connection()
        try:
            conn.execute("UPDATE rankings SET x_handle = ? WHERE username = ?",
                         (x_handle.strip().lstrip("@") if x_handle else None, username.lower()))
            conn.commit()
        finally:
            conn.close()

def get_username_by_x_handle(x_handle: str) -> Optional[str]:
    """Return the username that has already linked this X handle (or None).
    Used to keep one X handle tied to a single account."""
    h = (x_handle or "").strip().lstrip("@")
    if not h:
        return None
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT username FROM rankings WHERE x_handle IS NOT NULL AND LOWER(x_handle) = LOWER(?) LIMIT 1",
            (h,)).fetchone()
        return row["username"] if row else None
    finally:
        conn.close()

def get_leaderboard(limit: int = 100, offset: int = 0, tier_filter: Optional[str] = None) -> List[Dict]:
    conn = _get_connection()
    try:
        if tier_filter:
            rows = conn.execute("""SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) AS position
                FROM rankings WHERE tier = ? ORDER BY score DESC LIMIT ? OFFSET ?""",
                (tier_filter, limit, offset)).fetchall()
        else:
            rows = conn.execute("""SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) AS position
                FROM rankings ORDER BY score DESC LIMIT ? OFFSET ?""",
                (limit, offset)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def get_user_position(username: str) -> Optional[Dict]:
    conn = _get_connection()
    try:
        row = conn.execute("""SELECT *, (SELECT COUNT(*) + 1 FROM rankings AS r2 WHERE r2.score > rankings.score) AS position
            FROM rankings WHERE username = ?""", (username.lower(),)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def get_user_country_position(username: str) -> Optional[Dict]:
    """Return the user's rank position within their own country."""
    conn = _get_connection()
    try:
        row = conn.execute("SELECT country, score FROM rankings WHERE username = ?",
                           (username.lower(),)).fetchone()
        if not row or not row["country"]:
            return None
        country, score = row["country"], row["score"]
        pos = conn.execute(
            "SELECT COUNT(*) + 1 AS p FROM rankings WHERE country = ? AND score > ?",
            (country, score)).fetchone()["p"]
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM rankings WHERE country = ?",
            (country,)).fetchone()["c"]
        return {"country": country, "country_position": pos, "country_total": total}
    finally:
        conn.close()

def get_oldest_usernames(limit: int = 5) -> List[str]:
    """Usernames with the oldest last_updated — for background refresh rotation."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT username FROM rankings ORDER BY last_updated ASC LIMIT ?",
            (limit,)).fetchall()
        return [r["username"] for r in rows]
    finally:
        conn.close()


def get_stats() -> Dict:
    conn = _get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) AS cnt FROM rankings").fetchone()["cnt"]
        avg = conn.execute("SELECT COALESCE(AVG(score), 0) AS avg FROM rankings").fetchone()["avg"]
        dist_rows = conn.execute("SELECT tier, COUNT(*) AS cnt FROM rankings GROUP BY tier ORDER BY cnt DESC").fetchall()
        return {"total_users": total, "rank_distribution": {row["tier"]: row["cnt"] for row in dist_rows}, "avg_score": round(avg, 1)}
    finally:
        conn.close()

def search_leaderboard(query: str) -> List[Dict]:
    conn = _get_connection()
    try:
        rows = conn.execute("""SELECT *, (SELECT COUNT(*) + 1 FROM rankings AS r2 WHERE r2.score > rankings.score) AS position
            FROM rankings WHERE username LIKE ? ORDER BY score DESC LIMIT 25""",
            (f"%{query.lower()}%",)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
def update_country(username: str, country: str) -> None:
    with _db_lock:
        conn = _get_connection()
        try:
            conn.execute("UPDATE rankings SET country = ? WHERE username = ?",
                         (country, username.lower()))
            conn.commit()
        finally:
            conn.close()

def get_leaderboard_by_country(country: str, limit: int = 100, offset: int = 0) -> List[Dict]:
    conn = _get_connection()
    try:
        rows = conn.execute('''SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) AS position
            FROM rankings WHERE country = ? ORDER BY score DESC LIMIT ? OFFSET ?''',
            (country, limit, offset)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Account ownership — a lightweight "this device owns this account" model.
# A browser generates a random key, sends it (we store only its hash). The
# first device to set a country/X handle for an account claims it; afterwards
# only that device may change those fields. No login required.
# ---------------------------------------------------------------------------
def get_owner_info(username: str) -> Optional[Dict]:
    """Return {'owner_key', 'country'} for a username, or None if the account
    isn't in the leaderboard yet."""
    conn = _get_connection()
    try:
        row = conn.execute("SELECT owner_key, country FROM rankings WHERE username = ?",
                           (username.lower(),)).fetchone()
        if not row:
            return None
        return {"owner_key": row["owner_key"], "country": row["country"]}
    finally:
        conn.close()

def claim_owner(username: str, key_hash: str) -> bool:
    """Atomically claim an account for a device, but only if it's still
    unclaimed. Returns True if this call performed the claim."""
    with _db_lock:
        conn = _get_connection()
        try:
            cur = conn.execute(
                "UPDATE rankings SET owner_key = ? WHERE username = ? AND owner_key IS NULL",
                (key_hash, username.lower()))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

# ---------------------------------------------------------------------------
# Geocoding cache (see geo.py) — free-text location string -> ISO-2 country.
# Returns None when the string has never been looked up; returns '' when it was
# looked up and resolved to no country (so we don't re-hit Nominatim for it).
# ---------------------------------------------------------------------------
def geocode_cache_get(q: str) -> Optional[str]:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT country FROM geocode_cache WHERE q = ?", (q,)).fetchone()
        return row["country"] if row else None
    finally:
        conn.close()

def geocode_cache_set(q: str, country: str) -> None:
    with _db_lock:
        conn = _get_connection()
        try:
            conn.execute("INSERT OR REPLACE INTO geocode_cache (q, country) VALUES (?, ?)",
                         (q, country or ""))
            conn.commit()
        finally:
            conn.close()

# ---------------------------------------------------------------------------
# TMDB person-image cache (see tmdb.py) — lower(name) -> headshot URL.
# None = never looked up; '' = looked up, no image found.
# ---------------------------------------------------------------------------
def person_cache_get(name: str) -> Optional[str]:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT image FROM person_cache WHERE name = ?", (name,)).fetchone()
        return row["image"] if row else None
    finally:
        conn.close()

def person_cache_set(name: str, image: str) -> None:
    with _db_lock:
        conn = _get_connection()
        try:
            conn.execute("INSERT OR REPLACE INTO person_cache (name, image) VALUES (?, ?)",
                         (name, image or ""))
            conn.commit()
        finally:
            conn.close()

# ---------------------------------------------------------------------------
# Actor / director popularity leaderboards — aggregated from every user's stored
# taste profile. "Popularity" = how many users have this person in their top
# list; ties broken by the combined rank score of those users (so among equally
# popular names, the one backed by stronger cinephiles ranks higher).
# ---------------------------------------------------------------------------
def get_people_leaderboard(kind: str, limit: int = 50) -> List[Dict]:
    """kind: 'actors' or 'directors'. Returns
    [{name, fans, score_sum, avg_rating, rating_count, position}].
    avg_rating is the average star rating (0.5-5) users gave to that person's
    films, pooled across everyone who has them in their top list."""
    field = "top_actors" if kind == "actors" else "fav_directors"
    ratings_field = "actor_ratings" if kind == "actors" else "director_ratings"
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT score, taste_profile FROM rankings WHERE taste_profile IS NOT NULL"
        ).fetchall()
    finally:
        conn.close()

    tally: Dict[str, Dict] = {}
    for row in rows:
        try:
            tp = json.loads(row["taste_profile"]) or {}
        except Exception:
            continue
        names = tp.get(field) or []
        ratings = tp.get(ratings_field) or {}
        user_score = row["score"] or 0
        seen = set()
        for name in names:
            if not name:
                continue
            key = " ".join(str(name).split())          # canonical display name
            low = key.lower()
            if low in seen:                            # one vote per user per name
                continue
            seen.add(low)
            slot = tally.setdefault(low, {"name": key, "fans": 0, "score_sum": 0,
                                          "rating_sum": 0.0, "rating_n": 0})
            slot["fans"] += 1
            slot["score_sum"] += user_score
            rc = ratings.get(name)                     # {"sum": float, "n": int}
            if rc and rc.get("n"):
                slot["rating_sum"] += rc.get("sum", 0) or 0
                slot["rating_n"] += rc["n"]

    ranked = sorted(tally.values(), key=lambda d: (-d["fans"], -d["score_sum"], d["name"].lower()))
    out = []
    for i, d in enumerate(ranked[:limit]):
        avg = round(d["rating_sum"] / d["rating_n"], 1) if d["rating_n"] else None
        out.append({"name": d["name"], "fans": d["fans"], "score_sum": d["score_sum"],
                    "avg_rating": avg, "rating_count": d["rating_n"], "position": i + 1})
    return out
