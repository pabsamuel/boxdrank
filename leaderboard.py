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
                # Once set, only that device may change the account's country / X handle.
                conn.execute("ALTER TABLE rankings ADD COLUMN owner_key TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rankings_score ON rankings (score DESC)")
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
        "reviews": stats.get("reviews", [])
    })
    with _db_lock:
        conn = _get_connection()
        try:
            # Check if user exists to preserve created_at
            row = conn.execute("SELECT created_at, country, x_handle FROM rankings WHERE username = ?", (username.lower(),)).fetchone()
            created_at = row["created_at"] if row and row["created_at"] else now
            country = row["country"] if row and "country" in row.keys() else None
            x_handle = row["x_handle"] if row and "x_handle" in row.keys() else None

            conn.execute("""
                INSERT OR REPLACE INTO rankings (
                    username, score, tier, division, lp,
                    films_watched, avg_rating, reviews_count, lists_count, followers,
                    this_year_count, avatar_url, country, x_handle, taste_profile, created_at, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
