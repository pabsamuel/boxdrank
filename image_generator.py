"""
Generate shareable rank card images using Pillow
"""
from PIL import Image, ImageDraw, ImageFont
import io
import os
from typing import Dict

# Card dimensions
WIDTH = 800
HEIGHT = 480

# Rank tier colors (RGB tuples for Pillow)
RANK_RGB = {
    "Challenger": {"bg": (26, 5, 51), "accent": (212, 168, 67)},
    "Grandmaster": {"bg": (26, 10, 10), "accent": (232, 64, 87)},
    "Master": {"bg": (10, 10, 26), "accent": (155, 89, 182)},
    "Diamond": {"bg": (10, 26, 42), "accent": (93, 173, 226)},
    "Emerald": {"bg": (10, 42, 10), "accent": (46, 204, 113)},
    "Platinum": {"bg": (26, 26, 42), "accent": (72, 201, 176)},
    "Gold": {"bg": (42, 26, 10), "accent": (244, 208, 63)},
    "Silver": {"bg": (26, 26, 26), "accent": (189, 195, 199)},
    "Bronze": {"bg": (42, 26, 10), "accent": (205, 127, 50)},
    "Iron": {"bg": (26, 26, 26), "accent": (127, 140, 141)},
}


def _get_font(size: int, bold: bool = False):
    """Try to load a nice font, fall back to default"""
    font_paths = [
        # Windows
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        # Linux (DigitalOcean / Docker)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        # macOS
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default(size=size)


def generate_rank_card(username: str, stats: Dict, rank_info: Dict) -> Image.Image:
    """Generate a beautiful rank card image"""
    tier = rank_info.get("tier", "Iron")
    colors = RANK_RGB.get(tier, RANK_RGB["Iron"])
    
    # Create image
    img = Image.new("RGB", (WIDTH, HEIGHT), colors["bg"])
    draw = ImageDraw.Draw(img)
    
    # --- Background glow effect ---
    # Subtle circle behind the rank
    cx, cy = 240, 240
    for r in range(200, 50, -25):
        alpha = int(40 - (r / 200) * 30)
        draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            outline=colors["accent"],
            width=1
        )
    
    # --- Top bar with accent ---
    draw.rectangle([0, 0, WIDTH, 4], fill=colors["accent"])
    draw.rectangle([0, HEIGHT - 4, WIDTH, HEIGHT], fill=colors["accent"])
    
    # --- Left side: Rank tier & division ---
    font_large = _get_font(64, bold=True)
    font_medium = _get_font(32, bold=True)
    font_small = _get_font(20, bold=True)
    font_tiny = _get_font(16, bold=False)
    font_micro = _get_font(14, bold=False)
    
    # Tier name (e.g. "DIAMOND")
    draw.text((50, 55), tier.upper(), fill=colors["accent"], font=_get_font(52, bold=True))
    
    # Division (e.g. "III")
    division = rank_info.get("division", "IV")
    draw.text((55, 120), division, fill=(255, 255, 255), font=_get_font(80, bold=True))
    
    # LP
    lp = rank_info.get("lp", 0)
    draw.text((55, 210), f"{lp} LP", fill=colors["accent"], font=_get_font(36, bold=True))
    
    # Score
    score = rank_info.get("score", 0)
    draw.text((55, 265), f"Score: {score}", fill=(180, 180, 180), font=font_tiny)
    
    # Percentile
    percentile = rank_info.get("percentile", 1)
    draw.text((55, 300), f"Top {percentile}%", fill=(140, 140, 140), font=font_micro)
    
    # --- Divider line ---
    draw.line([(340, 40), (340, 440)], fill=colors["accent"], width=2)
    
    # --- Right side: Stats ---
    right_x = 380
    y_start = 50
    
    stats_items = [
        ("FILMS WATCHED", f"{stats.get('films_watched', 0):,}"),
        ("AVG RATING", f"★ {stats.get('avg_rating', 0):.1f}" if stats.get('avg_rating') else "★ n/a"),
        ("REVIEWS", f"{stats.get('reviews_count', 0):,}"),
        ("LISTS", f"{stats.get('lists_count', 0):,}"),
        ("THIS YEAR", f"{stats.get('this_year_count', 0):,}"),
        ("FOLLOWERS", f"{stats.get('followers', 0):,}"),
    ]
    
    y = y_start
    for label, value in stats_items:
        draw.text((right_x, y), label, fill=(150, 150, 150), font=font_micro)
        draw.text((right_x, y + 18), value, fill=(255, 255, 255), font=font_small)
        y += 58
    
    # --- Bottom: Username and branding ---
    # Username
    draw.text((50, 380), f"@{username}", fill=(200, 200, 200), font=_get_font(26, bold=True))
    
    # BoxdRank branding
    draw.text((50, 420), "boxdrank.com", fill=(100, 100, 100), font=font_micro)
    
    # Bottom right branding
    brand_font = _get_font(18, bold=True)
    brand_text = "BoxdRank"
    brand_bbox = draw.textbbox((0, 0), brand_text, font=brand_font)
    brand_w = brand_bbox[2] - brand_bbox[0]
    draw.text((WIDTH - brand_w - 50, 420), brand_text, fill=colors["accent"], font=brand_font)
    
    return img