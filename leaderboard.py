"""
Leaderboard Module - SQLite-based persistent leaderboard for BoxdRank.
"""
import sqlite3
import threading
import os
from typing import Optional, Dict, List
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boxdrank.db")
_db_lock = threading.Lock()

def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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
                    created_at      TEXT NOT NULL DEFAULT '',
                    last_updated    TEXT NOT NULL
                )
            """)
            try:
                conn.execute("ALTER TABLE rankings ADD COLUMN avatar_url TEXT DEFAULT NULL")
            except sqlite3.OperationalError:
                pass
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rankings_score ON rankings (score DESC)")
            conn.commit()
        finally:
            conn.close()

def save_ranking(username: str, stats: Dict, rank_info: Dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _db_lock:
        conn = _get_connection()
        try:
            conn.execute(
                """INSERT INTO rankings
                    (username, score, tier, division, lp, films_watched, avg_rating, reviews_count, lists_count, followers, this_year_count, avatar_url, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    score=excluded.score, tier=excluded.tier, division=excluded.division, lp=excluded.lp,
                    films_watched=excluded.films_watched, avg_rating=excluded.avg_rating, reviews_count=excluded.reviews_count,
                    lists_count=excluded.lists_count, followers=excluded.followers, this_year_count=excluded.this_year_count,
                    avatar_url=excluded.avatar_url, last_updated=excluded.last_updated""",
                (username.lower(), rank_info.get("score",0), rank_info.get("tier","Iron"), rank_info.get("division","IV"),
                 rank_info.get("lp",0), stats.get("films_watched",0), stats.get("avg_rating",0.0),
                 stats.get("reviews_count",0), stats.get("lists_count",0), stats.get("followers",0),
                 stats.get("this_year_count",0), stats.get("avatar_url",""), now),
            )
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