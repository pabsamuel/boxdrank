import requests
from bs4 import BeautifulSoup

r = requests.get('https://letterboxd.com/teqelerserserri/films/', headers={'User-Agent': 'Mozilla/5.0'})
soup = BeautifulSoup(r.text, 'lxml')

# Find film poster containers
posters = soup.find_all('li', class_=lambda c: c and 'poster-container' in str(c))
print(f"Film posters found: {len(posters)}")

if posters:
    # Show first poster HTML
    print("\n--- First poster ---")
    print(posters[0].prettify()[:800])
    
    # Extract film slugs
    print("\n--- Film slugs ---")
    for p in posters[:10]:
        div = p.find('div', class_='film-poster')
        if div:
            slug = div.get('data-film-slug', '')
            name = div.get('data-film-name', '')
            print(f"  {slug} -> {name}")

# Check for pagination
print("\n--- Pagination ---")
paginate = soup.find('div', class_='paginate-pages')
if paginate:
    links = paginate.find_all('a')
    print(f"Pages: {[a.get_text(strip=True) for a in links]}")