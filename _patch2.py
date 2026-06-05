# 2. Update app.py - add country endpoints
with open('app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# Add country to leaderboard API params
c = c.replace(
    "tier_filter = request.args.get(\"tier\", None)",
    "tier_filter = request.args.get(\"tier\", None)\n    country_filter = request.args.get(\"country\", None)"
)

# Add country filter logic to api_leaderboard
c = c.replace(
    "entries = leaderboard.get_leaderboard(limit=limit, offset=offset, tier_filter=tier_filter)",
    "entries = leaderboard.get_leaderboard_by_country(country_filter, limit, offset) if country_filter else leaderboard.get_leaderboard(limit=limit, offset=offset, tier_filter=tier_filter)"
)

# Add country update endpoint before the final if __name__
idx = c.rfind('if __name__')
country_endpoint = """
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

"""
c = c[:idx] + country_endpoint + c[idx:]

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(c)

print("app.py updated")