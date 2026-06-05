with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Remove the duplicate countrySelect from rank card
# Find and remove the entire countrySelect block
idx = c.find(';sh.innerHTML+=`<div class="country-select"')
if idx > 0:
    # Find the matching closing </select></div>`;sh.style.display
    end_marker = "sh.style.display='flex'"
    end = c.find(end_marker, idx)
    # Go back to find the actual end of the countrySelect block
    # It's before sh.style.display='flex';setTimeout
    # Let me find the exact pattern
    close_tag = '</select></div>`;'
    close_idx = c.find(close_tag, idx)
    if close_idx > 0:
        c = c[:idx] + c[close_idx + len(close_tag):]
        print("Removed countrySelect")
    else:
        print("Could not find close tag for countrySelect")
else:
    print("countrySelect not found")

# 2. Remove saveCountry function  
c = c.replace("async function saveCountry(){const c=document.getElementById('countrySelect').value;if(!c||!curUser)return;try{await fetch('/api/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:curUser,country:c})});toast('Country set!')}catch{toast('Failed')}}\n", '')
print("Removed saveCountry")

# 3. Make modal country dropdown writable - change select to input+datalist
old_select = 'id="modalCountry" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%"><option value="">🌍 All Countries</option>'
# Build options list
opts = ""
for code, flag, name in [
    ("TR","🇹🇷","Turkey"),("US","🇺🇸","United States"),("GB","🇬🇧","United Kingdom"),
    ("DE","🇩🇪","Germany"),("FR","🇫🇷","France"),("IT","🇮🇹","Italy"),("ES","🇪🇸","Spain"),
    ("NL","🇳🇱","Netherlands"),("CA","🇨🇦","Canada"),("AU","🇦🇺","Australia"),
    ("JP","🇯🇵","Japan"),("KR","🇰🇷","South Korea"),("IN","🇮🇳","India"),
    ("BR","🇧🇷","Brazil"),("MX","🇲🇽","Mexico"),("AR","🇦🇷","Argentina"),
    ("AT","🇦🇹","Austria"),("BE","🇧🇪","Belgium"),("CL","🇨🇱","Chile"),
    ("CN","🇨🇳","China"),("CO","🇨🇴","Colombia"),("CZ","🇨🇿","Czech Republic"),
    ("DK","🇩🇰","Denmark"),("EG","🇪🇬","Egypt"),("FI","🇫🇮","Finland"),
    ("GR","🇬🇷","Greece"),("HU","🇭🇺","Hungary"),("ID","🇮🇩","Indonesia"),
    ("IE","🇮🇪","Ireland"),("IL","🇮🇱","Israel"),("MY","🇲🇾","Malaysia"),
    ("NG","🇳🇬","Nigeria"),("NO","🇳🇴","Norway"),("NZ","🇳🇿","New Zealand"),
    ("PH","🇵🇭","Philippines"),("PK","🇵🇰","Pakistan"),("PL","🇵🇱","Poland"),
    ("PT","🇵🇹","Portugal"),("RO","🇷🇴","Romania"),("RU","🇷🇺","Russia"),
    ("SA","🇸🇦","Saudi Arabia"),("SE","🇸🇪","Sweden"),("SG","🇸🇬","Singapore"),
    ("TH","🇹🇭","Thailand"),("UA","🇺🇦","Ukraine"),("VN","🇻🇳","Vietnam"),
    ("ZA","🇿🇦","South Africa"),
]:
    opts += f'<option value="{flag} {name}">{flag} {name}</option>'

# Build searchable input+datalist
new_input = f'''id="modalCountry" list="countryList" autocomplete="off" placeholder="🌍 Start typing your country..." style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%"><datalist id="countryList">{opts}</datalist>'''

# Find and replace the select tag  
sel_start = c.find('<select id="modalCountry"')
if sel_start >= 0:
    sel_end = c.find('</select>', sel_start) + len('</select>')
    old_full = c[sel_start:sel_end]
    c = c[:sel_start] + '<input ' + new_input + '</input>' + c[sel_end:]
    print("Replaced modal select with searchable input")
else:
    print("Could not find modalCountry select")

# 4. Update startLookup to read the input value and extract country code
# The user might type "🇹🇷 Turkey" or "Turkey" - we need the code
# Build a mapping from display text to code  
code_map = {f"{f} {n}": c for c,f,n in [
    ("TR","🇹🇷","Turkey"),("US","🇺🇸","United States"),("GB","🇬🇧","United Kingdom"),
    ("DE","🇩🇪","Germany"),("FR","🇫🇷","France"),("IT","🇮🇹","Italy"),("ES","🇪🇸","Spain"),
    ("NL","🇳🇱","Netherlands"),("CA","🇨🇦","Canada"),("AU","🇦🇺","Australia"),
    ("JP","🇯🇵","Japan"),("KR","🇰🇷","South Korea"),("IN","🇮🇳","India"),
    ("BR","🇧🇷","Brazil"),("MX","🇲🇽","Mexico"),("AR","🇦🇷","Argentina"),
    ("AT","🇦🇹","Austria"),("BE","🇧🇪","Belgium"),("CL","🇨🇱","Chile"),
    ("CN","🇨🇳","China"),("CO","🇨🇴","Colombia"),("CZ","🇨🇿","Czech Republic"),
    ("DK","🇩🇰","Denmark"),("EG","🇪🇬","Egypt"),("FI","🇫🇮","Finland"),
    ("GR","🇬🇷","Greece"),("HU","🇭🇺","Hungary"),("ID","🇮🇩","Indonesia"),
    ("IE","🇮🇪","Ireland"),("IL","🇮🇱","Israel"),("MY","🇲🇾","Malaysia"),
    ("NG","🇳🇬","Nigeria"),("NO","🇳🇴","Norway"),("NZ","🇳🇿","New Zealand"),
    ("PH","🇵🇭","Philippines"),("PK","🇵🇰","Pakistan"),("PL","🇵🇱","Poland"),
    ("PT","🇵🇹","Portugal"),("RO","🇷🇴","Romania"),("RU","🇷🇺","Russia"),
    ("SA","🇸🇦","Saudi Arabia"),("SE","🇸🇪","Sweden"),("SG","🇸🇬","Singapore"),
    ("TH","🇹🇭","Thailand"),("UA","🇺🇦","Ukraine"),("VN","🇻🇳","Vietnam"),
    ("ZA","🇿🇦","South Africa"),
]}
# Also add name-only lookup
for c,f,n in [("TR","🇹🇷","Turkey"),("US","🇺🇸","United States"),("GB","🇬🇧","United Kingdom"),
    ("DE","🇩🇪","Germany"),("FR","🇫🇷","France"),("IT","🇮🇹","Italy"),("ES","🇪🇸","Spain"),
    ("NL","🇳🇱","Netherlands"),("CA","🇨🇦","Canada"),("AU","🇦🇺","Australia"),
    ("JP","🇯🇵","Japan"),("KR","🇰🇷","South Korea"),("IN","🇮🇳","India"),
    ("BR","🇧🇷","Brazil"),("MX","🇲🇽","Mexico"),("AR","🇦🇷","Argentina"),
    ("AT","🇦🇹","Austria"),("BE","🇧🇪","Belgium"),("CL","🇨🇱","Chile"),
    ("CN","🇨🇳","China"),("CO","🇨🇴","Colombia"),("CZ","🇨🇿","Czech Republic"),
    ("DK","🇩🇰","Denmark"),("EG","🇪🇬","Egypt"),("FI","🇫🇮","Finland"),
    ("GR","🇬🇷","Greece"),("HU","🇭🇺","Hungary"),("ID","🇮🇩","Indonesia"),
    ("IE","🇮🇪","Ireland"),("IL","🇮🇱","Israel"),("MY","🇲🇾","Malaysia"),
    ("NG","🇳🇬","Nigeria"),("NO","🇳🇴","Norway"),("NZ","🇳🇿","New Zealand"),
    ("PH","🇵🇭","Philippines"),("PK","🇵🇰","Pakistan"),("PL","🇵🇱","Poland"),
    ("PT","🇵🇹","Portugal"),("RO","🇷🇴","Romania"),("RU","🇷🇺","Russia"),
    ("SA","🇸🇦","Saudi Arabia"),("SE","🇸🇪","Sweden"),("SG","🇸🇬","Singapore"),
    ("TH","🇹🇭","Thailand"),("UA","🇺🇦","Ukraine"),("VN","🇻🇳","Vietnam"),
    ("ZA","🇿🇦","South Africa")]:
    code_map[n.lower()] = c

# Build JS lookup for the code map
country_codes_js = "{"
for code, flag, name in [
    ("TR","🇹🇷","Turkey"),("US","🇺🇸","United States"),("GB","🇬🇧","United Kingdom"),
    ("DE","🇩🇪","Germany"),("FR","🇫🇷","France"),("IT","🇮🇹","Italy"),("ES","🇪🇸","Spain"),
    ("NL","🇳🇱","Netherlands"),("CA","🇨🇦","Canada"),("AU","🇦🇺","Australia"),
    ("JP","🇯🇵","Japan"),("KR","🇰🇷","South Korea"),("IN","🇮🇳","India"),
    ("BR","🇧🇷","Brazil"),("MX","🇲🇽","Mexico"),("AR","🇦🇷","Argentina"),
    ("AT","🇦🇹","Austria"),("BE","🇧🇪","Belgium"),("CL","🇨🇱","Chile"),
    ("CN","🇨🇳","China"),("CO","🇨🇴","Colombia"),("CZ","🇨🇿","Czech Republic"),
    ("DK","🇩🇰","Denmark"),("EG","🇪🇬","Egypt"),("FI","🇫🇮","Finland"),
    ("GR","🇬🇷","Greece"),("HU","🇭🇺","Hungary"),("ID","🇮🇩","Indonesia"),
    ("IE","🇮🇪","Ireland"),("IL","🇮🇱","Israel"),("MY","🇲🇾","Malaysia"),
    ("NG","🇳🇬","Nigeria"),("NO","🇳🇴","Norway"),("NZ","🇳🇿","New Zealand"),
    ("PH","🇵🇭","Philippines"),("PK","🇵🇰","Pakistan"),("PL","🇵🇱","Poland"),
    ("PT","🇵🇹","Portugal"),("RO","🇷🇴","Romania"),("RU","🇷🇺","Russia"),
    ("SA","🇸🇦","Saudi Arabia"),("SE","🇸🇪","Sweden"),("SG","🇸🇬","Singapore"),
    ("TH","🇹🇭","Thailand"),("UA","🇺🇦","Ukraine"),("VN","🇻🇳","Vietnam"),
    ("ZA","🇿🇦","South Africa"),
]:
    country_codes_js += f"'{flag} {name}':'{code}','{name.lower()}':'{code}',"
country_codes_js += "}"

# Update the fetch call to extract country code from input
old_fetch = "var mc=document.getElementById(\"modalCountry\");if(mc&&mc.value){fetch(\"/api/country\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({username:u,country:mc.value})})}"
# We need a mapping in JS
new_fetch = f"var mc=document.getElementById(\"modalCountry\");if(mc&&mc.value){{var cc=" + country_codes_js + ";var co=cc[mc.value]||mc.value;fetch(\"/api/country\",{{method:\"POST\",headers:{{\"Content-Type\":\"application/json\"}},body:JSON.stringify({{username:u,country:co}})}})}}"
c = c.replace(old_fetch, new_fetch)
print("Updated country code lookup in JS")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("DONE - Single searchable country input in modal")