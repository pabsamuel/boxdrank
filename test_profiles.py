"""
Test multiple Letterboxd profiles to verify rank calculations
"""
from scraper import get_user_stats
from rank_engine import calculate_rank
import time

# Diverse profiles across different activity levels
PROFILES = [
    # Big film critics / power users
    ("davidehrlich", "Film critic (IndieWire) - high films + followers"),
    ("kambole", "Film writer - moderate films"),
    ("pj", "PJ - power user with tons of reviews"),
    
    # Popular Letterboxd personalities
    ("lucy", "Lucy - Letterboxd staff / popular reviewer"),
    ("bratpitt", "Brat Pitt - cinephile"),
    ("matt", "Matt - Letterboxd staff"),
    
    # Casual users
    ("sam", "Sam - very common username, likely casual"),
    ("jake", "Jake - common casual user"),
    
    # Try some random letters (might fail, that's fine)
    ("ab", "Short username test"),
    ("filmfan2020", "Numeric suffix test"),
]

print("=" * 70)
print("  BoxdRank Test Suite - Multiple Profile Verification")
print("=" * 70)
print()

results = []

for username, description in PROFILES:
    print(f"▶ Testing: {username} ({description})")
    try:
        stats = get_user_stats(username)
        if stats is None:
            print(f"  ❌ Could not fetch (404 or network error)")
            results.append((username, "FAILED", None, None, None))
            continue
        
        if stats.get("films_watched", 0) == 0:
            print(f"  ⚠️  Profile found but no film data extracted")
            results.append((username, "NO_DATA", None, None, None))
            continue
        
        rank = calculate_rank(stats)
        
        print(f"  ✅ Films: {stats['films_watched']:,} | "
              f"Avg: {stats.get('avg_rating', 0):.1f} | "
              f"Reviews: {stats['reviews_count']:,} | "
              f"Lists: {stats['lists_count']:,}")
        print(f"  🏆 {rank['full_rank']} — {rank['lp']} LP (Score: {rank['score']}) | Top {rank['percentile']}%")
        print()
        
        results.append((username, "OK", rank['full_rank'], rank['score'], rank['lp']))
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        results.append((username, "ERROR", None, None, None))
    
    # Be polite to Letterboxd
    time.sleep(1.5)

print("=" * 70)
print("  SUMMARY")
print("=" * 70)
print(f"{'Username':<20} {'Status':<10} {'Rank':<20} {'Score':<8} {'LP':<6}")
print("-" * 70)
for username, status, rank, score, lp in results:
    r = rank or "—"
    s = str(score) if score is not None else "—"
    l = str(lp) if lp is not None else "—"
    print(f"{username:<20} {status:<10} {r:<20} {s:<8} {l:<6}")

print()

# Tally ranks
tiers_found = {}
for _, status, rank, _, _ in results:
    if status == "OK" and rank:
        tier = rank.split()[0]
        tiers_found[tier] = tiers_found.get(tier, 0) + 1

print("Rank distribution in test set:")
for tier in ["Challenger", "Grandmaster", "Master", "Diamond", "Emerald", 
             "Platinum", "Gold", "Silver", "Bronze", "Iron"]:
    count = tiers_found.get(tier, 0)
    bar = "█" * count if count > 0 else ""
    print(f"  {tier:<14} {count} {bar}")