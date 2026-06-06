import requests
from bs4 import BeautifulSoup

r = requests.get('https://letterboxd.com/film/marie-antoinette-2006/', headers={'User-Agent': 'Mozilla/5.0'})
soup = BeautifulSoup(r.text, "lxml")

# Find cast tab
cast_div = soup.find(id='tab-cast')
if cast_div:
    print("Cast div found!")
    # Find actor links within
    for a in cast_div.find_all('a', href=True):
        href = a['href']
        if '/actor/' in href:
            print(f"  Actor: {a.get_text(strip=True)}")
    # Also check for director
    for a in cast_div.find_all('a', href=True):
        href = a['href']
        if '/director/' in href:
            print(f"  Director: {a.get_text(strip=True)}")
else:
    print("No cast div found - searching all page...")
    for a in soup.find_all('a', href=lambda h: h and '/actor/' in h):
        print(f"Actor: {a.get_text(strip=True)} -> {a['href']}")
    for a in soup.find_all('a', href=lambda h: h and '/director/' in h):
        print(f"Director: {a.get_text(strip=True)} -> {a['href']}")

# Also check for genres
for a in soup.find_all('a', href=lambda h: h and '/films/genre/' in h):
    print(f"Genre: {a.get_text(strip=True)}")