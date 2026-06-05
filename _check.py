import requests

r = requests.get('http://127.0.0.1:5000/api/leaderboard')
d = r.json()
entries = d.get('leaderboard', [])
print(f"Toplam kisi: {len(entries)}")
for e in entries:
    av = "VAR" if e.get("avatar_url") else "YOK"
    print(f"  #{e['position']} {e['username']}: avatar={av}, score={e['score']}")