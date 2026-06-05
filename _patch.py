import re

# 1. Update leaderboard.py - add country support
with open('leaderboard.py', 'r', encoding='utf-8') as f:
    c = f.read()

# Add country column to table
c = c.replace(
    'avatar_url      TEXT DEFAULT NULL,',
    'avatar_url      TEXT DEFAULT NULL,\n                    country         TEXT DEFAULT NULL,'
)

# Add migration for country
c = c.replace(
    'conn.execute("ALTER TABLE rankings ADD COLUMN avatar_url TEXT DEFAULT NULL")\n            except sqlite3.OperationalError:\n                pass\n            conn.execute("CREATE INDEX',
    'conn.execute("ALTER TABLE rankings ADD COLUMN avatar_url TEXT DEFAULT NULL")\n            except sqlite3.OperationalError:\n                pass\n            try:\n                conn.execute("ALTER TABLE rankings ADD COLUMN country TEXT DEFAULT NULL")\n            except sqlite3.OperationalError:\n                pass\n            conn.execute("CREATE INDEX'
)

# Add update_country function and country-filtered leaderboard
c += """
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
"""

with open('leaderboard.py', 'w', encoding='utf-8') as f:
    f.write(c)

print("leaderboard.py updated")