"""
Letterboxd profile scraper - extracts user film stats from profile page
"""
import requests
from bs4 import BeautifulSoup
import re
import time
import threading
import logging
from typing import Optional, Dict

log = logging.getLogger("boxdrank.scraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# --- In-memory cache: username -> (data_dict, timestamp) ---
_cache: Dict[str, tuple] = {}
_CACHE_TTL = 30 * 60  # 30 minutes
_MAX_CACHE_SIZE = 10000  # Prevent unbounded memory growth

# --- Rate limiting ---
_last_request_time: float = 0.0
_MIN_REQUEST_INTERVAL = 0.5  # seconds between outgoing requests
_rate_lock = threading.Lock()

# --- Retry settings ---
_MAX_RETRIES = 2
_RETRY_DELAY = 2  # seconds



def get_user_stats(username: str) -> Optional[Dict]:
    """
    Scrape a public Letterboxd profile for film stats.
    Returns dict with: films_watched, avg_rating, reviews_count, lists_count, followers,
                       fav_directors, fav_genres, this_year_count, rated_count

    Features:
        - In-memory cache (30-minute TTL)
        - Rate limiting (min 1.5 s between requests)
        - Retry on failure (up to 2 retries with 2 s delay)
    """
    # --- Check cache first ---
    cached = _cache.get(username)
    if cached is not None:
        data, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return data

    url = f"https://letterboxd.com/{username}/"

    # --- Rate limiting ---
    global _last_request_time
    with _rate_lock:
        elapsed = time.time() - _last_request_time
        if elapsed < _MIN_REQUEST_INTERVAL:
            time.sleep(_MIN_REQUEST_INTERVAL - elapsed)
        _last_request_time = time.time()

    # --- Request with retry logic ---
    resp = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            break  # success
        except requests.RequestException as e:
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY)
            else:
                log.warning("Request failed for %s after %d attempts: %s", username, _MAX_RETRIES + 1, e)
                return None

    if resp is None:
        return None


    soup = BeautifulSoup(resp.text, "lxml")

    data: Dict = {
        "films_watched": 0,
        "avg_rating": 0.0,
        "reviews_count": 0,
        "lists_count": 0,
        "followers": 0,
        "this_year_count": 0,
        "rated_count": 0,
        "following": 0,
        "fav_directors": [],
        "fav_genres": [],
        "avatar_url": "",
    }

    # --- Avatar / Profile Photo (from og:image) ---
    og_img = soup.find("meta", property="og:image")
    if og_img:
        avatar = og_img.get("content", "")
        if avatar:
            data["avatar_url"] = avatar

    # --- Meta description (contains films watched count) ---
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc:
        content = meta_desc.get("content", "")
        match = re.search(r"(\d[\d,]*)\s*films?\s*watched", content, re.I)
        if match:
            data["films_watched"] = int(match.group(1).replace(",", ""))

    # --- Profile Stats div (main source) ---
    # Format: "3,389Films110This year73Lists38Following210,100Followers"
    stats_div = soup.find("div", class_="profile-stats")
    if stats_div:
        stats_text = stats_div.get_text(strip=True)
        # Parse individual stat blocks using the <h4> and <a> pattern
        stat_blocks = stats_div.find_all("h4", class_="profile-statistic")
        
        for block in stat_blocks:
            text = block.get_text(strip=True)
            # Find the linked number (inside <a class="thousands"> or <span class="value">)
            link = block.find("a") or block.find("span", class_="value")
            if link:
                val = re.sub(r"[^\d]", "", link.get_text(strip=True))
                num = int(val) if val else 0
            else:
                val = re.sub(r"[^\d]", "", text)
                num = int(val) if val else 0

            text_lower = text.lower()
            if "film" in text_lower and "this year" not in text_lower:
                if data["films_watched"] == 0:
                    data["films_watched"] = num
            elif "this year" in text_lower or "year" in text_lower:
                data["this_year_count"] = num
            elif "list" in text_lower:
                data["lists_count"] = num
            elif "follow" in text_lower:
                # "Following" or "Followers"
                if "following" in text_lower:
                    data["following"] = num
                elif "follower" in text_lower:
                    data["followers"] = num
            elif "review" in text_lower:
                data["reviews_count"] = num
    
    # --- Rating stats (table with distribution) ---
    # Find the rating table - it has rows with star ratings and counts
    rating_section = soup.find("section", id="ratings")
    if not rating_section:
        rating_section = soup.find("div", class_=re.compile(r"rating-histogram"))
    
    if rating_section:
        rating_rows = rating_section.find_all("tr") or rating_section.find_all("li")
        total_rated = 0
        weighted_sum = 0
        
        for row in rating_rows:
            row_text = row.get_text(strip=True)
            
            # Skip header/total rows
            if ("all" in row_text.lower() or "rating" in row_text.lower()) and "star" in row_text.lower():
                continue
            
            # Find the count number: "756 (23%)" format
            # The first number followed by (X%) is the count
            count_match = re.search(r"(\d[\d,]*)\s*\(\d+%\)", row_text)
            if not count_match:
                continue
            
            count = int(count_match.group(1).replace(",", ""))
            
            # Don't count the total row (usually the biggest number)
            # Real rating rows have star characters or half-star indicators
            if count > 0:
                star_count = row_text.count("★")
                has_half = "½" in row_text
                
                if has_half:
                    star_val = star_count + 0.5
                else:
                    star_val = star_count
                
                if star_val >= 0.5 and star_val <= 5.0:
                    total_rated += count
                    weighted_sum += count * star_val
        
        if total_rated > 0:
            data["rated_count"] = total_rated
            data["avg_rating"] = round(weighted_sum / total_rated, 1)

    # --- Fallback: Calculate avg rating from og:description or stats text ---
    if data["avg_rating"] == 0.0:
        # Try meta description for average
        if meta_desc:
            content = meta_desc.get("content", "")
            rating_match = re.search(r"average.*?(\d+\.\d+)", content, re.I)
            if rating_match:
                data["avg_rating"] = float(rating_match.group(1))
    
    # --- Reviews count from links ---
    if data["reviews_count"] == 0:
        # Look for review stats in the profile header or links
        for a in soup.find_all("a", href=re.compile(r"/reviews/?$")):
            parent = a.find_parent(["h4", "div", "li"])
            if parent:
                text = parent.get_text(strip=True)
                num_match = re.search(r"(\d[\d,]*)", text)
                if num_match:
                    data["reviews_count"] = int(num_match.group(1).replace(",", ""))
                    break

    # --- Reviews count from ratings table ---
    if data["reviews_count"] == 0 and data["rated_count"] > 0:
        # If they've rated films, they probably have at least some reviews
        # We can approximate or set to 0
        pass

    # --- Collect ALL film links from the profile page ---
    # Letterboxd profile pages show recent films in the activity/diary section.
    # We scrape every unique film link found on the page.
    film_links = []
    seen_slugs = set()

    # 1. Favorites section
    fav_section = soup.find("section", id=re.compile(r"favourites|favorites"))
    if fav_section:
        for poster in fav_section.find_all("div", class_=re.compile(r"favourite-production|film-poster")):
            react_div = poster.find("div", class_="react-component")
            if react_div:
                film_link = react_div.get("data-item-link", "")
                slug = film_link.rstrip("/").split("/")[-1]
                if film_link and slug not in seen_slugs:
                    seen_slugs.add(slug)
                    film_links.append(film_link)

    # 2. ALL film links from the profile page
    for a in soup.find_all("a", href=re.compile(r"/film/")):
        href = a.get("href", "")
        m = re.match(r"^(?:/\w+)?/film/([^/]+)/?$", href)
        if m:
            slug = m.group(1)
            if slug not in seen_slugs and len(slug) > 2 and 'poster' not in slug and 'genre' not in slug:
                seen_slugs.add(slug)
                film_links.append(href)

    # 3. If no film links found, try the diary page
    if not film_links:
        try:
            diary_url = f"https://letterboxd.com/{username}/films/diary/"
            diary_resp = requests.get(diary_url, headers=HEADERS, timeout=10)
            diary_soup = BeautifulSoup(diary_resp.text, "lxml")
            for a in diary_soup.find_all("a", href=re.compile(r"/film/")):
                href = a.get("href", "")
                m = re.match(r"^(?:/\w+)?/film/([^/]+)/?$", href)
                if m:
                    slug = m.group(1)
                    if slug not in seen_slugs and len(slug) > 2 and 'poster' not in slug and 'genre' not in slug:
                        seen_slugs.add(slug)
                        film_links.append(href)
        except Exception:
            pass

    # 4. RSS feed fallback — always works and returns ALL films/diary
    if not film_links:
        try:
            rss_url = f"https://letterboxd.com/{username}/rss/"
            rss_resp = requests.get(rss_url, headers=HEADERS, timeout=10)
            # Extract film URLs from RSS: <link>https://letterboxd.com/user/film/slug/</link>
            rss_films = re.findall(
                r'<link>https?://letterboxd\.com/\w+/film/([^/]+)/</link>',
                rss_resp.text,
            )
            for slug in rss_films:
                if slug not in seen_slugs and len(slug) > 2:
                    seen_slugs.add(slug)
                    film_links.append(f"/film/{slug}/")
        except Exception:
            pass

    total_films = data.get("films_watched", 0)
    # Restore the original 100 film sample size
    max_to_scrape = min(max(total_films, len(film_links)), 15)
    film_links_to_use = film_links[:max_to_scrape]

    # --- Pre-load ratings AND TMDB IDs from RSS feed ---
    film_ratings = {}   # slug -> rating (e.g. "the-shining" -> 4.5)
    tmdb_ids = {}       # slug -> tmdb_id (e.g. "the-shining" -> "694")
    try:
        rss_url = f"https://letterboxd.com/{username}/rss/"
        rss_resp = requests.get(rss_url, headers=HEADERS, timeout=10)
        if rss_resp.status_code == 200:
            items = re.findall(r'<item>(.*?)</item>', rss_resp.text, re.DOTALL)
            for item in items:
                link_match = re.search(r'<link>https?://letterboxd\.com/\w+/film/([^/]+)/</link>', item)
                rating_match = re.search(r'<letterboxd:memberRating>([\d.]+)</letterboxd:memberRating>', item)
                tmdb_match = re.search(r'<tmdb:movieId>(\d+)</tmdb:movieId>', item)
                if link_match:
                    slug = link_match.group(1)
                    if rating_match and slug not in film_ratings:
                        film_ratings[slug] = float(rating_match.group(1))
                    if tmdb_match and slug not in tmdb_ids:
                        tmdb_ids[slug] = tmdb_match.group(1)
    except Exception:
        pass

    film_count = len(film_links_to_use)
    if film_count > 0:
        film_genres = {}
        all_directors = {}
        all_actors = {}
        
        import concurrent.futures

        def process_film(film_link):
            local_genres = {}
            local_directors = {}
            local_actors = {}
            try:
                # Normalize: /username/film/slug/ -> /film/slug/
                slug = re.sub(r'.*/film/([^/]+)/?.*', r'\1', film_link)
                film_url = f"https://letterboxd.com/film/{slug}/"
                film_resp = requests.get(film_url, headers=HEADERS, timeout=8)
                film_soup = BeautifulSoup(film_resp.text, "lxml")

                # Get user's rating from RSS data (1-5 stars)
                user_rating = film_ratings.get(slug, 0)
                # Weight: rated films use actual stars, unrated default to 3.0 neutral
                weight = user_rating if user_rating > 0 else 3.0

                # Genres from film page — weighted by rating
                for a in film_soup.find_all("a", href=re.compile(r"/films/genre/")):
                    g = a.get_text(strip=True).lower()
                    if g:
                        local_genres[g] = local_genres.get(g, 0) + weight

                # Directors from film page — weighted by YOUR rating
                for a in film_soup.find_all("a", href=re.compile(r"/director/")):
                    name = a.get_text(strip=True)
                    if name:
                        local_directors[name] = local_directors.get(name, 0) + weight

                # Actors from film page
                for a in film_soup.find_all("a", href=re.compile(r"/actor/")):
                    name = a.get_text(strip=True)
                    if name:
                        local_actors[name] = local_actors.get(name, 0) + weight
            except Exception as e:
                log.debug("Failed film %s: %s", film_link, e)
            return local_genres, local_directors, local_actors

        with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
            results = executor.map(process_film, film_links_to_use)
            for res_genres, res_directors, res_actors in results:
                for k, v in res_genres.items():
                    film_genres[k] = film_genres.get(k, 0) + v
                for k, v in res_directors.items():
                    all_directors[k] = all_directors.get(k, 0) + v
                for k, v in res_actors.items():
                    all_actors[k] = all_actors.get(k, 0) + v

        # Sort by weighted score — highest rated + most watched first
        for g, _ in sorted(film_genres.items(), key=lambda x: -x[1]):
            if g not in data["fav_genres"]:
                data["fav_genres"].append(g)
                if len(data["fav_genres"]) >= 5:
                    break

        data["fav_directors"] = []
        for name, _ in sorted(all_directors.items(), key=lambda x: -x[1]):
            if name not in data["fav_directors"]:
                data["fav_directors"].append(name)
                if len(data["fav_directors"]) >= 3:
                    break

        data["top_actors"] = []
        for name, _ in sorted(all_actors.items(), key=lambda x: -x[1]):
            if name not in data["top_actors"]:
                data["top_actors"].append(name)
                if len(data["top_actors"]) >= 3:
                    break

    if "fav_films" not in data:
        data["fav_films"] = film_links[:4]

    # --- Extract ALL reviews from RSS with user avatar info ---
    data["reviews"] = []
    try:
        rss_url = f"https://letterboxd.com/{username}/rss/"
        rss_resp = requests.get(rss_url, headers=HEADERS, timeout=10)
        if rss_resp.status_code == 200:
            items = re.findall(r'<item>(.*?)</item>', rss_resp.text, re.DOTALL)
            avatar = data.get("avatar_url", "")
            for item in items:
                desc_match = re.search(r'<description><!\[CDATA\[(.*?)\]\]></description>', item, re.DOTALL)
                rating_match = re.search(r'<letterboxd:memberRating>([\d.]+)</letterboxd:memberRating>', item)
                film_match = re.search(r'<letterboxd:filmTitle>([^<]+)</letterboxd:filmTitle>', item)
                like_match = re.search(r'<letterboxd:memberLike>(Yes|No)</letterboxd:memberLike>', item)
                pubdate_match = re.search(r'<pubDate>([^<]+)</pubDate>', item)
                if desc_match:
                    review_text = re.sub(r'<[^>]+>', ' ', desc_match.group(1)).strip()
                    review_text = re.sub(r'\s+', ' ', review_text)[:250]
                    if len(review_text) > 15:
                        is_liked = (like_match.group(1) == "Yes") if like_match else False
                        data["reviews"].append({
                            "text": review_text,
                            "film": film_match.group(1) if film_match else "",
                            "rating": float(rating_match.group(1)) if rating_match else 0,
                            "date": pubdate_match.group(1) if pubdate_match else "",
                            "length": len(review_text),
                            "liked": is_liked,
                            "avatar": avatar,
                            "username": username,
                        })
            # Sort: liked first, then by rating, then by length
            data["reviews"].sort(key=lambda r: (-r["liked"], -r["rating"], -r["length"]))
            # Only keep top 5
            data["reviews"] = data["reviews"][:5]
    except Exception:
        pass

    # --- If this_year is still 0, try from the year stats section ---
    if data["this_year_count"] == 0:
        year_section = soup.find("section", class_=re.compile(r"year"))
        if year_section:
            for a in year_section.find_all("a"):
                if "year" in a.get("href", ""):
                    num_match = re.search(r"(\d[\d,]*)", a.get_text(strip=True))
                    if num_match:
                        data["this_year_count"] = int(num_match.group(1).replace(",", ""))
                        break
    
    # Fallback: try from stats text directly
    if data["this_year_count"] == 0 and stats_div:
        stats_text = stats_div.get_text(strip=True)
        year_match = re.search(r"(\d[\d,]*)\s*This\s*[Yy]ear", stats_text)
        if year_match:
            data["this_year_count"] = int(year_match.group(1).replace(",", ""))

    # --- Store result in cache (with size limit) ---
    if len(_cache) >= _MAX_CACHE_SIZE:
        # Remove oldest 20% of entries
        sorted_keys = sorted(_cache, key=lambda k: _cache[k][1])
        for k in sorted_keys[:len(sorted_keys) // 5]:
            del _cache[k]
    _cache[username] = (data, time.time())

    return data