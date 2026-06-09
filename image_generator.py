# -*- coding: utf-8 -*-
"""
BoxdRank — shareable rank card generator (Pillow).

Design: "Premium Collectible — Ranked Trading Card" (1200x630, X/Twitter ratio).
Renders supersampled then downscales for crisp anti-aliasing.

Cross-platform fonts: tries Windows fonts first, falls back to DejaVu/Liberation
on Linux (DigitalOcean / Docker) so the card renders identically in production.
"""
import io
import os
import math
import logging
from typing import Dict, Optional

from PIL import Image, ImageDraw, ImageFont, ImageFilter

log = logging.getLogger("boxdrank.image")

# --------------------------------------------------------------------------- #
# CONFIG
# --------------------------------------------------------------------------- #
WIDTH, HEIGHT = 1200, 630
SS = 2  # supersample factor
BRAND_URL = os.environ.get("BOXDRANK_DOMAIN", "boxdrank.app")   # set BOXDRANK_DOMAIN to your real domain
BRAND_GREEN = (0, 224, 84)

TIER_COLORS = {
    "Challenger": (212, 168, 67), "Grandmaster": (232, 64, 87),
    "Master": (155, 89, 182), "Diamond": (93, 173, 226),
    "Emerald": (46, 204, 113), "Platinum": (72, 201, 176),
    "Gold": (244, 208, 63), "Silver": (189, 195, 199),
    "Bronze": (205, 127, 50), "Iron": (127, 140, 141),
}

# --------------------------------------------------------------------------- #
# FONTS — role -> ordered candidate paths (Windows, then Linux fallbacks)
# --------------------------------------------------------------------------- #
_WIN = "C:/Windows/Fonts/"
_DEJA = "/usr/share/fonts/truetype/dejavu/"
_LIB = "/usr/share/fonts/truetype/liberation/"

_FONT_CANDIDATES = {
    "black":    [_WIN + "seguibl.ttf", _WIN + "ariblk.ttf",
                 _DEJA + "DejaVuSans-Bold.ttf", _LIB + "LiberationSans-Bold.ttf"],
    "heavy":    [_WIN + "ariblk.ttf", _WIN + "seguibl.ttf",
                 _DEJA + "DejaVuSans-Bold.ttf", _LIB + "LiberationSans-Bold.ttf"],
    "bold":     [_WIN + "segoeuib.ttf", _WIN + "arialbd.ttf",
                 _DEJA + "DejaVuSans-Bold.ttf", _LIB + "LiberationSans-Bold.ttf"],
    "semibold": [_WIN + "seguisb.ttf", _WIN + "segoeuib.ttf",
                 _DEJA + "DejaVuSans-Bold.ttf", _DEJA + "DejaVuSans.ttf"],
    "regular":  [_WIN + "segoeui.ttf", _WIN + "arial.ttf",
                 _DEJA + "DejaVuSans.ttf", _LIB + "LiberationSans-Regular.ttf"],
    "mono":     [_WIN + "consola.ttf", _DEJA + "DejaVuSansMono.ttf",
                 _LIB + "LiberationMono-Regular.ttf"],
    "condensed":[_WIN + "bahnschrift.ttf", _WIN + "seguibl.ttf",
                 _DEJA + "DejaVuSansCondensed-Bold.ttf", _DEJA + "DejaVuSans-Bold.ttf"],
}

_font_cache: Dict[tuple, ImageFont.FreeTypeFont] = {}
_resolved_path: Dict[str, str] = {}   # role -> the path that worked


def _font(role: str, size: int) -> ImageFont.FreeTypeFont:
    key = (role, size)
    if key in _font_cache:
        return _font_cache[key]
    px = size * SS
    # reuse a path that already worked for this role
    path = _resolved_path.get(role)
    if path:
        try:
            f = ImageFont.truetype(path, px)
            _font_cache[key] = f
            return f
        except Exception:
            pass
    for cand in _FONT_CANDIDATES.get(role, []):
        try:
            f = ImageFont.truetype(cand, px)
            _resolved_path[role] = cand
            _font_cache[key] = f
            return f
        except Exception:
            continue
    # last resort
    try:
        f = ImageFont.load_default(size=px)
    except Exception:
        f = ImageFont.load_default()
    _font_cache[key] = f
    return f


# --------------------------------------------------------------------------- #
# HELPERS
# --------------------------------------------------------------------------- #
def _s(v) -> int:
    return int(round(v * SS))


def _lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _mix(c, target, t):
    return _lerp(c, target, t)


def _alpha(c, a):
    return (c[0], c[1], c[2], a)


def _text_w(draw, txt, font):
    b = draw.textbbox((0, 0), txt, font=font)
    return b[2] - b[0]


def _shadow_text(draw, xy, txt, font, fill, shadow=(0, 0, 0, 160),
                 off=(0, 2), anchor=None):
    draw.text((xy[0] + off[0] * SS, xy[1] + off[1] * SS), txt, font=font,
              fill=shadow, anchor=anchor)
    draw.text(xy, txt, font=font, fill=fill, anchor=anchor)


def _star(draw, cx, cy, r_out, fill, points=5, r_in_ratio=0.42, rot=-90):
    r_in = r_out * r_in_ratio
    pts = []
    for i in range(points * 2):
        ang = math.radians(rot + i * (360.0 / (points * 2)))
        rr = r_out if i % 2 == 0 else r_in
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    draw.polygon(pts, fill=fill)


def _load_avatar(url: str, diameter: int) -> Optional[Image.Image]:
    """Download an avatar and return it cropped to a circle, or None on failure."""
    if not url:
        return None
    try:
        import requests
        r = requests.get(url, timeout=5,
                         headers={"User-Agent": "Mozilla/5.0 (BoxdRank card)"})
        if r.status_code != 200 or not r.content:
            return None
        av = Image.open(io.BytesIO(r.content)).convert("RGB")
        w, h = av.size
        m = min(w, h)
        av = av.crop(((w - m) // 2, (h - m) // 2,
                      (w - m) // 2 + m, (h - m) // 2 + m)).resize(
                          (diameter, diameter), Image.LANCZOS)
        mask = Image.new("L", (diameter, diameter), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, diameter, diameter], fill=255)
        out = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
        out.paste(av, (0, 0), mask)
        return out
    except Exception as e:
        log.debug("avatar load failed for %s: %s", url, e)
        return None


# --------------------------------------------------------------------------- #
# MAIN
# --------------------------------------------------------------------------- #
def generate_rank_card(username: str, stats: Dict, rank_info: Dict,
                       lb_position: Optional[int] = None,
                       lb_total: Optional[int] = None) -> Image.Image:
    """Render a 1200x630 shareable rank card and return a PIL RGB Image."""
    W, H = WIDTH, HEIGHT
    tier = rank_info.get("tier", "Iron")
    accent = TIER_COLORS.get(tier, TIER_COLORS["Iron"])
    division = str(rank_info.get("division", "") or "")
    lp = int(rank_info.get("lp", 0) or 0)
    score = int(rank_info.get("score", 0) or 0)
    percentile = rank_info.get("percentile", 1)
    avg_rating = stats.get("avg_rating", 0) or 0

    # ---- fonts ----
    f_tier      = _font("black", 78)
    f_div       = _font("bold", 34)
    f_label     = _font("semibold", 15)
    f_label_sm  = _font("semibold", 13)
    f_stat_num  = _font("black", 30)
    f_user_at   = _font("regular", 26)
    f_brand     = _font("semibold", 19)
    f_brand_sm  = _font("regular", 15)
    f_lp_unit   = _font("semibold", 22)
    f_serial    = _font("mono", 15)
    f_micro     = _font("semibold", 12)
    f_score_big = _font("condensed", 64)
    f_chip      = _font("semibold", 16)
    f_holo      = _font("heavy", 18)
    f_watermark = _font("black", 300)

    # ---- background: radial vignette (rendered small, upscaled = fast) ----
    dark1 = _mix((10, 12, 16), accent, 0.06)
    dark2 = _mix((4, 5, 7), accent, 0.02)
    gw, gh = 200, 105
    small = Image.new("RGB", (gw, gh))
    sp = small.load()
    gcx, gcy = gw * 0.30, gh * 0.42
    gmax = math.hypot(gw, gh)
    for yy in range(gh):
        for xx in range(gw):
            d = math.hypot(xx - gcx, yy - gcy) / gmax
            sp[xx, yy] = _lerp(dark1, dark2, min(1.0, d * 1.35))
    img = small.resize((W * SS, H * SS), Image.BILINEAR).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # diagonal brushed-foil streaks
    streak = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    sd = ImageDraw.Draw(streak)
    for i in range(-40, 80):
        xx = i * _s(36)
        a = 8 if i % 2 == 0 else 4
        sd.line([(xx, 0), (xx + _s(260), H * SS)],
                fill=_alpha(_mix(accent, (255, 255, 255), 0.4), a), width=_s(2))
    streak = streak.filter(ImageFilter.GaussianBlur(_s(1)))
    img = Image.alpha_composite(img.convert("RGBA"), streak).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # ---- outer collectible frame ----
    M = 34
    card_box = [_s(M), _s(M), _s(W - M), _s(H - M)]
    card_r = _s(28)

    shadow = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    shd = ImageDraw.Draw(shadow)
    shd.rounded_rectangle([_s(M + 6), _s(M + 14), _s(W - M + 6), _s(H - M + 14)],
                          radius=card_r, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(_s(14)))
    img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # card body gradient masked to rounded rect
    card_top = _mix((24, 27, 33), accent, 0.10)
    card_bot = _mix((12, 13, 17), accent, 0.04)
    cardimg = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cardimg)
    ch = card_box[3] - card_box[1]
    for i in range(card_box[1], card_box[3]):
        t = (i - card_box[1]) / ch
        cd.line([(card_box[0], i), (card_box[2], i)], fill=_lerp(card_top, card_bot, t))
    mask = Image.new("L", (W * SS, H * SS), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle(card_box, radius=card_r, fill=255)
    img.paste(Image.composite(cardimg.convert("RGB"), img, mask), (0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    # inner top sheen
    sheen = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    shn = ImageDraw.Draw(sheen)
    shn.ellipse([_s(M - 80), _s(M - 240), _s(W - M + 120), _s(M + 180)],
                fill=_alpha(_mix(accent, (255, 255, 255), 0.55), 26))
    sheen = sheen.filter(ImageFilter.GaussianBlur(_s(40)))
    sheen_masked = Image.composite(sheen, Image.new("RGBA", sheen.size, (0, 0, 0, 0)), mask)
    img = Image.alpha_composite(img.convert("RGBA"), sheen_masked).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # foil border (double stroke + outer glow)
    draw.rounded_rectangle(card_box, radius=card_r, outline=accent, width=_s(3))
    inset = [card_box[0] + _s(7), card_box[1] + _s(7), card_box[2] - _s(7), card_box[3] - _s(7)]
    draw.rounded_rectangle(inset, radius=card_r - _s(7),
                           outline=_alpha(_mix(accent, (255, 255, 255), 0.5), 120), width=_s(1))
    draw.rounded_rectangle([card_box[0] - _s(2), card_box[1] - _s(2),
                            card_box[2] + _s(2), card_box[3] + _s(2)],
                           radius=card_r + _s(2), outline=_alpha(accent, 60), width=_s(1))

    def corner(cxn, cyn, dx, dy):
        L = _s(30)
        col = _alpha(_mix(accent, (255, 255, 255), 0.6), 200)
        draw.line([(cxn, cyn), (cxn + dx * L, cyn)], fill=col, width=_s(3))
        draw.line([(cxn, cyn), (cxn, cyn + dy * L)], fill=col, width=_s(3))
    ci = _s(20)
    corner(card_box[0] + ci, card_box[1] + ci, 1, 1)
    corner(card_box[2] - ci, card_box[1] + ci, -1, 1)
    corner(card_box[0] + ci, card_box[3] - ci, 1, -1)
    corner(card_box[2] - ci, card_box[3] - ci, -1, -1)

    # giant faint watermark tier initial
    wm = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    wmd = ImageDraw.Draw(wm)
    wmd.text((_s(W - 250), _s(H // 2 + 20)), (tier[:1] or "?").upper(), font=f_watermark,
             fill=_alpha(_mix(accent, (255, 255, 255), 0.3), 26), anchor="mm")
    wm = wm.filter(ImageFilter.GaussianBlur(_s(1)))
    wm_masked = Image.composite(wm, Image.new("RGBA", wm.size, (0, 0, 0, 0)), mask)
    img = Image.alpha_composite(img.convert("RGBA"), wm_masked).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # ---- header strip ----
    pad = _s(56)
    top_y = _s(M + 30)
    right_edge = _s(W - M - 50)

    bsz = _s(28)
    bx, by = pad, top_y
    _cube_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "favicon.png")
    try:
        cube = Image.open(_cube_path).convert("RGBA").resize((int(bsz), int(bsz)), Image.LANCZOS)
        img = img.convert("RGBA")
        img.alpha_composite(cube, (int(bx), int(by)))
        img = img.convert("RGB")
        draw = ImageDraw.Draw(img, "RGBA")
    except Exception:
        draw.rounded_rectangle([bx, by, bx + bsz, by + bsz], radius=_s(7), fill=BRAND_GREEN)
        draw.text((bx + bsz / 2, by + bsz / 2 - _s(2)), "B", font=f_holo, fill=(8, 10, 12), anchor="mm")
    draw.text((bx + bsz + _s(12), by + bsz / 2), "BoxdRank", font=f_brand,
              fill=(238, 240, 243), anchor="lm")
    draw.text((bx + bsz + _s(12) + _text_w(draw, "BoxdRank", f_brand) + _s(10), by + bsz / 2),
              "· " + BRAND_URL, font=f_brand_sm, fill=(150, 156, 165), anchor="lm")

    if lb_position:
        draw.text((right_edge, by + bsz / 2 - _s(9)), f"#{lb_position:,}", font=f_brand,
                  fill=_mix(accent, (255, 255, 255), 0.45), anchor="rm")
        draw.text((right_edge, by + bsz / 2 + _s(12)), "GLOBAL RANK", font=f_micro,
                  fill=(120, 126, 135), anchor="rm")
    else:
        draw.text((right_edge, by + bsz / 2), "GLOBAL FILM RANK", font=f_micro,
                  fill=(120, 126, 135), anchor="rm")

    dly = top_y + _s(46)
    draw.line([(pad, dly), (right_edge, dly)], fill=_alpha((255, 255, 255), 22), width=_s(1))

    # ---- left: avatar + LP ring ----
    av_cx = pad + _s(96)
    av_cy = _s(310)
    av_r = _s(92)
    ring_w = _s(9)

    draw.ellipse([av_cx - av_r - ring_w, av_cy - av_r - ring_w,
                  av_cx + av_r + ring_w, av_cy + av_r + ring_w],
                 outline=_alpha((255, 255, 255), 30), width=ring_w)
    lp_frac = max(0.0, min(1.0, lp / 100.0))
    start_ang, end_ang = -90, -90 + 360 * lp_frac
    arcbox = [av_cx - av_r - ring_w // 2, av_cy - av_r - ring_w // 2,
              av_cx + av_r + ring_w // 2, av_cy + av_r + ring_w // 2]
    seg = 90
    for k in range(seg):
        a0 = start_ang + (end_ang - start_ang) * (k / seg)
        a1 = start_ang + (end_ang - start_ang) * ((k + 1) / seg)
        col = _lerp(_mix(accent, (255, 255, 255), 0.2), accent, k / seg)
        draw.arc(arcbox, a0, a1 + 1, fill=col, width=ring_w)

    # disc background gradient
    av_bg = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    ad = ImageDraw.Draw(av_bg)
    for rr in range(av_r, 0, -1):
        t = rr / av_r
        col = _lerp(_mix(accent, (0, 0, 0), 0.55), _mix(accent, (0, 0, 0), 0.2), 1 - t)
        ad.ellipse([av_cx - rr, av_cy - rr, av_cx + rr, av_cy + rr], fill=col)
    img = Image.alpha_composite(img.convert("RGBA"), av_bg).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # real avatar, or silhouette fallback
    avatar = _load_avatar(stats.get("avatar_url", ""), av_r * 2)
    if avatar is not None:
        img = img.convert("RGBA")
        img.alpha_composite(avatar, (av_cx - av_r, av_cy - av_r))
        img = img.convert("RGB")
        draw = ImageDraw.Draw(img, "RGBA")
    else:
        hd_r = _s(28)
        hd_cy = av_cy - _s(18)
        sil = _mix(accent, (255, 255, 255), 0.75)
        draw.ellipse([av_cx - hd_r, hd_cy - hd_r, av_cx + hd_r, hd_cy + hd_r], fill=_alpha(sil, 230))
        sh_w = _s(78)
        sh_top = av_cy + _s(20)
        draw.pieslice([av_cx - sh_w // 2, sh_top, av_cx + sh_w // 2, sh_top + _s(110)],
                      180, 360, fill=_alpha(sil, 230))

    draw.ellipse([av_cx - av_r, av_cy - av_r, av_cx + av_r, av_cy + av_r],
                 outline=_alpha((255, 255, 255), 50), width=_s(2))

    # LP badge
    lpb_w, lpb_h = _s(86), _s(30)
    lpb_x = av_cx - lpb_w // 2
    lpb_y = av_cy + av_r + ring_w - _s(4)
    draw.rounded_rectangle([lpb_x, lpb_y, lpb_x + lpb_w, lpb_y + lpb_h], radius=_s(15),
                           fill=_mix((18, 20, 25), accent, 0.18), outline=accent, width=_s(2))
    draw.text((av_cx, lpb_y + lpb_h / 2 - _s(1)), f"{lp} LP", font=f_chip,
              fill=_mix(accent, (255, 255, 255), 0.4), anchor="mm")

    # username + percentile chip
    uy = lpb_y + lpb_h + _s(34)
    uname = ("@" + username)
    if _text_w(draw, uname, f_user_at) > av_r * 2 + _s(60):
        uname = uname[:16] + "…"
    draw.text((av_cx, uy), uname, font=f_user_at, fill=(214, 218, 224), anchor="mm")
    if lb_position and lb_total:
        top_pct = max(1, math.ceil(lb_position / lb_total * 100))
    else:
        top_pct = percentile
    pc_txt = f"TOP {top_pct}%"
    pcw = _text_w(draw, pc_txt, f_micro) + _s(22)
    draw.rounded_rectangle([av_cx - pcw // 2, uy + _s(22), av_cx + pcw // 2, uy + _s(22) + _s(24)],
                           radius=_s(12), fill=_alpha(BRAND_GREEN, 36),
                           outline=_alpha(BRAND_GREEN, 150), width=_s(1))
    draw.text((av_cx, uy + _s(22) + _s(12)), pc_txt, font=f_micro, fill=BRAND_GREEN, anchor="mm")

    # ---- center-right: tier nameplate ----
    col_x = av_cx + av_r + _s(78)
    name_y = _s(132)

    draw.text((col_x, name_y), "CURRENT RANK", font=f_label,
              fill=_mix(accent, (255, 255, 255), 0.5), anchor="lm")
    draw.rectangle([col_x - _s(16), name_y - _s(8), col_x - _s(10), name_y + _s(8)], fill=accent)

    ty = name_y + _s(52)
    tier_txt = tier.upper()
    _shadow_text(draw, (col_x, ty), tier_txt, f_tier, fill=(245, 247, 250),
                 shadow=(0, 0, 0, 170), off=(0, 3), anchor="lm")

    if division:
        tnw = _text_w(draw, tier_txt, f_tier)
        dvx = col_x + tnw + _s(22)
        dv_h, dv_w = _s(60), _s(66)
        dv_y = ty - dv_h // 2
        pill = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
        pdw = ImageDraw.Draw(pill)
        for yy in range(dv_y, dv_y + dv_h):
            tt = (yy - dv_y) / dv_h
            pdw.line([(dvx, yy), (dvx + dv_w, yy)],
                     fill=_lerp(_mix(accent, (255, 255, 255), 0.35), _mix(accent, (0, 0, 0), 0.12), tt))
        pmask = Image.new("L", (W * SS, H * SS), 0)
        pmd = ImageDraw.Draw(pmask)
        pmd.rounded_rectangle([dvx, dv_y, dvx + dv_w, dv_y + dv_h], radius=_s(13), fill=255)
        img = Image.composite(pill.convert("RGB"), img.convert("RGB"), pmask)
        draw = ImageDraw.Draw(img, "RGBA")
        draw.rounded_rectangle([dvx, dv_y, dvx + dv_w, dv_y + dv_h], radius=_s(13),
                               outline=_alpha((255, 255, 255), 130), width=_s(2))
        draw.text((dvx + dv_w / 2, dv_y + dv_h / 2), division, font=f_div, fill=(14, 16, 22), anchor="mm")

    # score + LP blocks
    sc_y = ty + _s(70)
    draw.text((col_x, sc_y), "SCORE", font=f_label, fill=(150, 156, 165), anchor="lm")
    _shadow_text(draw, (col_x, sc_y + _s(40)), str(score), f_score_big,
                 fill=_mix(accent, (255, 255, 255), 0.55), shadow=(0, 0, 0, 140), off=(0, 2), anchor="lm")
    sw_score = _text_w(draw, str(score), f_score_big)
    vdx = col_x + sw_score + _s(46)
    draw.line([(vdx, sc_y - _s(2)), (vdx, sc_y + _s(58))], fill=_alpha((255, 255, 255), 40), width=_s(1))
    lpx = vdx + _s(40)
    draw.text((lpx, sc_y), "LEAGUE POINTS", font=f_label, fill=(150, 156, 165), anchor="lm")
    _shadow_text(draw, (lpx, sc_y + _s(40)), str(lp), f_score_big,
                 fill=(238, 240, 244), shadow=(0, 0, 0, 140), off=(0, 2), anchor="lm")
    lpnw = _text_w(draw, str(lp), f_score_big)
    draw.text((lpx + lpnw + _s(8), sc_y + _s(48)), "LP", font=f_lp_unit, fill=(150, 156, 165), anchor="lm")

    # ---- bottom: stats strip ----
    def _fmt(n):
        try:
            return f"{int(n):,}"
        except Exception:
            return str(n)

    rating_txt = f"{avg_rating:.1f}" if avg_rating else "n/a"
    stat_items = [
        ("FILMS",      _fmt(stats.get("films_watched", 0))),
        ("AVG RATING", rating_txt),
        ("REVIEWS",    _fmt(stats.get("reviews_count", 0))),
        ("LISTS",      _fmt(stats.get("lists_count", 0))),
        ("THIS YEAR",  _fmt(stats.get("this_year_count", 0))),
        ("FOLLOWERS",  _fmt(stats.get("followers", 0))),
    ]

    strip_x0, strip_x1 = col_x, right_edge
    strip_y0, strip_y1 = _s(452), _s(540)
    n = len(stat_items)
    gap = _s(12)
    cell_w = (strip_x1 - strip_x0 - gap * (n - 1)) / n

    for i, (lbl, val) in enumerate(stat_items):
        x0 = strip_x0 + i * (cell_w + gap)
        x1 = x0 + cell_w
        draw.rounded_rectangle([x0, strip_y0, x1, strip_y1], radius=_s(12),
                               fill=_alpha((255, 255, 255), 12),
                               outline=_alpha((255, 255, 255), 26), width=_s(1))
        draw.line([(x0 + _s(12), strip_y0 + _s(1)), (x1 - _s(12), strip_y0 + _s(1))],
                  fill=_alpha(accent, 90), width=_s(1))
        cxm = (x0 + x1) / 2
        is_star = (lbl == "AVG RATING" and avg_rating)
        val_col = _mix(accent, (255, 255, 255), 0.5) if is_star else (240, 242, 246)
        draw.text((cxm, strip_y0 + _s(30)), val, font=f_stat_num, fill=val_col, anchor="mm")
        if is_star:
            sx2 = cxm + _text_w(draw, val, f_stat_num) / 2 + _s(13)
            _star(draw, sx2, strip_y0 + _s(30), _s(10), accent)
        draw.text((cxm, strip_y1 - _s(20)), lbl, font=f_label_sm, fill=(148, 154, 163), anchor="mm")

    # footer + genre tags
    draw.line([(strip_x0, strip_y1 + _s(16)), (strip_x1, strip_y1 + _s(16))],
              fill=_alpha((255, 255, 255), 16), width=_s(1))
    draw.text((strip_x0, strip_y1 + _s(26)),
              f"Live Letterboxd rank · updates as you log films · {BRAND_URL}",
              font=f_brand_sm, fill=(132, 138, 147), anchor="lm")
    genres = [g for g in (stats.get("fav_genres") or [])[:3] if g]
    if genres:
        gtxt = "  ".join("#" + str(g).replace(" ", "") for g in genres)
        draw.text((strip_x1, strip_y1 + _s(26)), gtxt, font=f_brand_sm,
                  fill=_mix(accent, (255, 255, 255), 0.35), anchor="rm")

    # ---- downscale ----
    return img.resize((W, H), Image.LANCZOS)


def generate_card_bytes(username: str, stats: Dict, rank_info: Dict,
                        lb_position: Optional[int] = None,
                        lb_total: Optional[int] = None) -> bytes:
    """Convenience: return PNG bytes."""
    img = generate_rank_card(username, stats, rank_info, lb_position=lb_position, lb_total=lb_total)
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


if __name__ == "__main__":
    # quick visual test
    _stats = {"films_watched": 1243, "avg_rating": 3.9, "reviews_count": 87,
              "lists_count": 12, "this_year_count": 64, "followers": 210,
              "fav_genres": ["horror", "drama", "thriller"], "avatar_url": ""}
    _rank = {"tier": "Diamond", "division": "II", "lp": 67, "score": 642, "percentile": 64}
    generate_rank_card("cinephile_jane", _stats, _rank, lb_position=342).save("_cardgen/card_final.png", "PNG")
    print("saved _cardgen/card_final.png")
