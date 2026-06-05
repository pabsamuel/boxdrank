import requests
from bs4 import BeautifulSoup

r = requests.get('https://letterboxd.com/teqelerserserri/', headers={'User-Agent': 'Mozilla/5.0'})
soup = BeautifulSoup(r.text, 'lxml')

# Profile photo is usually an img with class containing 'avatar'
for img in soup.find_all('img'):
    src = img.get('src', '')
    cls = str(img.get('class', ''))
    if 'avatar' in cls.lower() or 'profile' in cls.lower():
        print('AVATAR:', src)
        break

# Also check og:image (profile pic is often the o g image)
og_img = soup.find('meta', property='og:image')
if og_img:
    print('OG IMAGE:', og_img.get('content', ''))

# Try the profile image divs
for div in soup.find_all('div', class_=lambda c: c and ('profile' in str(c).lower() or 'avatar' in str(c).lower())):
    for img in div.find_all('img'):
        print('DIV IMAGE:', img.get('src', ''))

# Check data attributes for profile photo
for tag in soup.find_all(['div', 'img', 'span']):
    for attr in ['data-avatar', 'data-profile-pic', 'src', 'data-image']:
        val = tag.get(attr, '')
        if val and ('avatar' in val.lower() or 'resized' in val.lower()):
            print(f'DATA ATTR {attr}:', val)

# Also check recent films links
print('\n--- Recent Film Links ---')
for a in soup.find_all('a', href=True):
    href = a['href']
    if '/film/' in href and 'poster' not in href and '/films/' not in href:
        text = a.get_text(strip=True)
        if text and len(text) > 1:
            print(f'{text} -> {href}')
            if len([x for x in locals().get('_seen', [])]) > 5:
                break