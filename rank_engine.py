"""
Rank Calculation Engine - Competitive ranking system for Letterboxd users
"""
from typing import Dict

# Rank tiers with divisions (I = best in tier, IV = worst in tier)
# Based on a composite score derived from multiple film stats
TIERS = [
    ("Challenger", 950),
    ("Grandmaster", 850),
    ("Master", 750),
    ("Diamond", 620),
    ("Emerald", 500),
    ("Platinum", 400),
    ("Gold", 300),
    ("Silver", 200),
    ("Bronze", 100),
    ("Iron", 0),
]

RANK_COLORS = {
    "Challenger": {"bg": "#1a0533", "accent": "#d4a843", "name": "Challenger"},
    "Grandmaster": {"bg": "#1a0a0a", "accent": "#e84057", "name": "Grandmaster"},
    "Master": {"bg": "#0a0a1a", "accent": "#9b59b6", "name": "Master"},
    "Diamond": {"bg": "#0a1a2a", "accent": "#5dade2", "name": "Diamond"},
    "Emerald": {"bg": "#0a2a0a", "accent": "#2ecc71", "name": "Emerald"},
    "Platinum": {"bg": "#1a1a2a", "accent": "#48c9b0", "name": "Platinum"},
    "Gold": {"bg": "#2a1a0a", "accent": "#f4d03f", "name": "Gold"},
    "Silver": {"bg": "#1a1a1a", "accent": "#bdc3c7", "name": "Silver"},
    "Bronze": {"bg": "#2a1a0a", "accent": "#cd7f32", "name": "Bronze"},
    "Iron": {"bg": "#1a1a1a", "accent": "#7f8c8d", "name": "Iron"},
}


def calculate_rank(stats: Dict) -> Dict:
    """
    Calculate a user's rank based on their Letterboxd stats.
    Returns dict with tier, division, score, percentile, and breakdown.
    """
    films = stats.get("films_watched", 0)
    avg_rating = stats.get("avg_rating", 0)
    reviews = stats.get("reviews_count", 0)
    lists = stats.get("lists_count", 0)
    this_year = stats.get("this_year_count", 0)
    followers = stats.get("followers", 0)

    # --- Score Calculation (max ~1000) ---
    score = 0

    # 1. Films watched (max 300 points)
    #   5 films = 10pts, 50 films = 50pts, 500 films = 150pts, 2000+ films = 300pts
    if films >= 5000:
        score += 300
    elif films >= 3000:
        score += 250
    elif films >= 2000:
        score += 220
    elif films >= 1000:
        score += 180
    elif films >= 500:
        score += 140
    elif films >= 200:
        score += 100
    elif films >= 100:
        score += 70
    elif films >= 50:
        score += 45
    elif films >= 20:
        score += 25
    elif films >= 5:
        score += 10
    else:
        score += 5

    # 2. Average rating quality (max 200 points)
    #   2.5 or below = 30, 3.0 = 60, 3.5 = 100, 4.0 = 150, 4.5+ = 200
    if avg_rating >= 4.5:
        score += 200
    elif avg_rating >= 4.0:
        score += 160
    elif avg_rating >= 3.5:
        score += 120
    elif avg_rating >= 3.0:
        score += 80
    elif avg_rating >= 2.5:
        score += 50
    elif avg_rating > 0:
        score += 30
    else:
        score += 20  # no rating data

    # 3. Reviews written (max 150 points) — bonus if review has text
    review_has_text = stats.get("top_review", {}).get("text", "")
    review_bonus = 10 if len(review_has_text) > 30 else 0  # extra if you write actual reviews
    
    if reviews >= 500:
        score += 150 + review_bonus
    elif reviews >= 200:
        score += 120 + review_bonus
    elif reviews >= 100:
        score += 100 + review_bonus
    elif reviews >= 50:
        score += 75 + review_bonus
    elif reviews >= 20:
        score += 50 + review_bonus
    elif reviews >= 5:
        score += 30 + review_bonus
    elif reviews >= 1:
        score += 15 + review_bonus

    # 4. Lists created (max 100 points)
    if lists >= 50:
        score += 100
    elif lists >= 20:
        score += 75
    elif lists >= 10:
        score += 55
    elif lists >= 5:
        score += 35
    elif lists >= 1:
        score += 20

    # 5. Films this year (max 150 points) - shows activity
    if this_year >= 300:
        score += 150
    elif this_year >= 200:
        score += 120
    elif this_year >= 100:
        score += 100
    elif this_year >= 50:
        score += 75
    elif this_year >= 20:
        score += 50
    elif this_year >= 10:
        score += 30
    elif this_year >= 1:
        score += 15

    # 6. Followers / influence (max 100 points)
    if followers >= 10000:
        score += 100
    elif followers >= 5000:
        score += 85
    elif followers >= 1000:
        score += 70
    elif followers >= 500:
        score += 55
    elif followers >= 100:
        score += 40
    elif followers >= 50:
        score += 25
    elif followers >= 10:
        score += 15
    elif followers >= 1:
        score += 5

    # --- Determine Tier and Division ---
    tier_name = "Iron"
    tier_score = 0
    for name, threshold in TIERS:
        if score >= threshold:
            tier_name = name
            tier_score = threshold
            break

    # Find next tier threshold for division calculation
    current_tier_idx = None
    next_threshold = 1000  # default max
    prev_threshold = 0
    
    for i, (name, threshold) in enumerate(TIERS):
        if name == tier_name:
            current_tier_idx = i
            break
    
    if current_tier_idx is not None and current_tier_idx > 0:
        prev_tier = TIERS[current_tier_idx - 1]
        prev_threshold = prev_tier[1]
    else:
        prev_threshold = 1010  # above cap for challenger
    
    if current_tier_idx is not None and current_tier_idx > 0:
        next_threshold = TIERS[current_tier_idx - 1][1]
    else:
        next_threshold = 1000

    # Calculate LP / division within tier
    tier_range = next_threshold - tier_score
    if tier_range <= 0:
        tier_range = 1
    progress_in_tier = score - tier_score
    progress_pct = min(progress_in_tier / max(tier_range, 1), 0.99)

    if progress_pct >= 0.75:
        division = "I"
        lp = int(progress_pct * 100)
    elif progress_pct >= 0.5:
        division = "II"
        lp = int(progress_pct * 100)
    elif progress_pct >= 0.25:
        division = "III"
        lp = int(progress_pct * 100)
    else:
        division = "IV"
        lp = int(progress_pct * 100)

    # Edge cases for top/bottom
    if tier_name == "Challenger":
        division = "I"
        lp = min(int((score - 950) / 0.5), 100)
        if lp > 100:
            lp = 100

    if tier_name == "Iron":
        lp = max(0, progress_pct * 100)

    # --- Percentile (approximate, for flex) ---
    # Maps score ~0-1000 to percentile
    percentile = min(int(score / 10), 99.9)
    if percentile < 1:
        percentile = 1

    rank_info = RANK_COLORS.get(tier_name, RANK_COLORS["Iron"]).copy()
    rank_info.update({
        "tier": tier_name,
        "division": division,
        "lp": int(lp),
        "score": score,
        "percentile": percentile,
        "full_rank": f"{tier_name} {division}",
        "badge_text": f"{tier_name} {division} — {int(lp)} LP",
        "breakdown": {
            "films_score": get_category_score(films, 300, [5, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000],
                                              [5, 25, 45, 70, 100, 140, 180, 220, 250, 300], [10, 25, 45, 70, 100, 140, 180, 220, 250, 300]),
            "rating_score": get_category_score(avg_rating, 200, [2.5, 3.0, 3.5, 4.0, 4.5],
                                               [30, 80, 120, 160, 200], [30, 80, 120, 160, 200]),
            "reviews_score": get_category_score(reviews, 150, [1, 5, 20, 50, 100, 200, 500],
                                                [15, 30, 50, 75, 100, 120, 150], [15, 30, 50, 75, 100, 120, 150]),
            "lists_score": get_category_score(lists, 100, [1, 5, 10, 20, 50],
                                              [20, 35, 55, 75, 100], [20, 35, 55, 75, 100]),
            "yearly_score": get_category_score(this_year, 150, [1, 10, 20, 50, 100, 200, 300],
                                               [15, 30, 50, 75, 100, 120, 150], [15, 30, 50, 75, 100, 120, 150]),
            "followers_score": get_category_score(followers, 100, [1, 10, 50, 100, 500, 1000, 5000, 10000],
                                                  [5, 15, 25, 40, 55, 70, 85, 100], [5, 15, 25, 40, 55, 70, 85, 100]),
        }
    })
    
    return rank_info


def get_category_score(value, max_score, thresholds, scores, fallback=None):
    """Helper to calculate score for a single category"""
    for i in range(len(thresholds) - 1, -1, -1):
        if value >= thresholds[i]:
            return scores[i] if fallback is None else fallback[i]
    return 0


def get_next_rank_info(rank_info: Dict) -> Dict:
    """
    Given current rank info, compute what the user needs to reach the next
    division or tier.

    Returns dict with:
        next_tier      – name of the next tier (or current if Challenger I)
        next_division  – next division label
        points_needed  – score points remaining to reach the next step
        progress_pct   – 0-100 progress percentage toward next step
    """
    current_tier = rank_info.get("tier", "Iron")
    current_division = rank_info.get("division", "IV")
    current_score = rank_info.get("score", 0)

    # Division order within a tier (IV -> III -> II -> I)
    division_order = ["IV", "III", "II", "I"]

    # Build a flat ordered list of (tier, division, min_score) breakpoints
    breakpoints = []
    for i in range(len(TIERS) - 1, -1, -1):
        tier_name, tier_threshold = TIERS[i]
        if tier_name == "Challenger":
            # Challenger only has division I
            breakpoints.append((tier_name, "I", tier_threshold))
            continue
        # For tiers with divisions, calculate the threshold for each division
        if i > 0:
            next_tier_threshold = TIERS[i - 1][1]
        else:
            next_tier_threshold = 1000
        tier_range = next_tier_threshold - tier_threshold
        for d_idx, div in enumerate(division_order):
            div_threshold = tier_threshold + int(tier_range * d_idx * 0.25)
            breakpoints.append((tier_name, div, div_threshold))

    # Find current position in breakpoints
    current_idx = None
    for idx, (t, d, _) in enumerate(breakpoints):
        if t == current_tier and d == current_division:
            current_idx = idx
            break

    # If already at the top, return maxed-out info
    if current_idx is None or current_idx >= len(breakpoints) - 1:
        return {
            "next_tier": current_tier,
            "next_division": current_division,
            "points_needed": 0,
            "progress_pct": 100,
        }

    next_bp = breakpoints[current_idx + 1]
    next_tier, next_division, next_threshold = next_bp
    current_threshold = breakpoints[current_idx][2]

    range_size = max(next_threshold - current_threshold, 1)
    progress = current_score - current_threshold
    progress_pct = min(int((progress / range_size) * 100), 99)

    return {
        "next_tier": next_tier,
        "next_division": next_division,
        "points_needed": max(next_threshold - current_score, 0),
        "progress_pct": progress_pct,
    }


# Score-to-title mapping (ascending order)
_RANK_TITLES = [
    (51,  "Film Newbie"),
    (151, "Casual Viewer"),
    (301, "Movie Buff"),
    (451, "Cinema Enthusiast"),
    (601, "Film Connoisseur"),
    (751, "Cinema Veteran"),
    (851, "Film Savant"),
    (951, "Cinephile Legend"),
]


def get_rank_title(score: int) -> str:
    """
    Return a fun descriptive title based on composite score.

    Score ranges:
        0-50   → Film Newbie
        51-150 → Casual Viewer
        151-300 → Movie Buff
        301-450 → Cinema Enthusiast
        451-600 → Film Connoisseur
        601-750 → Cinema Veteran
        751-850 → Film Savant
        851-950 → Cinephile Legend
        951+    → Cinema God
    """
    for threshold, title in _RANK_TITLES:
        if score < threshold:
            return title
    return "Cinema God"