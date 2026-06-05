with open('templates/index.html','r',encoding='utf-8') as f:
    c = f.read()

# 1. REMOVE leaderboard country dropdown completely  
# Pattern: var cs=document.createElement('select')... whole block
start = c.find("var cs=document.createElement('select');")
if start > 0:
    end_marker = "cs.value=lbCountry||'';document.getElementById('lbFilters').appendChild(cs);"
    end = c.find(end_marker, start)
    if end > 0:
        end += len(end_marker)
        # Remove everything from var cs to the end of that block
        # Also remove await fetchLB();lbLoaded=true that follows
        next_semi = c.find(';', end)
        c = c[:start] + c[next_semi+1:]
        print('Removed leaderboard country dropdown')
    else:
        print('Could not find end of cs dropdown')

# 2. Convert modal select to input+datalist (searchable)
old_select_start = '<select id="modalCountry"'
old_select_end = '</select>'
sel_start = c.find(old_select_start)
sel_end = c.find(old_select_end, sel_start) + len(old_select_end)

if sel_start > 0:
    # Build datalist options
    countries = [
        ("TR","Turkey"),("US","United States"),("GB","United Kingdom"),
        ("DE","Germany"),("FR","France"),("IT","Italy"),("ES","Spain"),
        ("NL","Netherlands"),("CA","Canada"),("AU","Australia"),
        ("JP","Japan"),("KR","South Korea"),("IN","India"),
        ("BR","Brazil"),("MX","Mexico"),("AR","Argentina"),
        ("AT","Austria"),("BE","Belgium"),("CL","Chile"),
        ("CN","China"),("CO","Colombia"),("CZ","Czech Republic"),
        ("DK","Denmark"),("EG","Egypt"),("FI","Finland"),
        ("GR","Greece"),("HU","Hungary"),("ID","Indonesia"),
        ("IE","Ireland"),("IL","Israel"),("MY","Malaysia"),
        ("NG","Nigeria"),("NO","Norway"),("NZ","New Zealand"),
        ("PH","Philippines"),("PK","Pakistan"),("PL","Poland"),
        ("PT","Portugal"),("RO","Romania"),("RU","Russia"),
        ("SA","Saudi Arabia"),("SE","Sweden"),("SG","Singapore"),
        ("TH","Thailand"),("UA","Ukraine"),("VN","Vietnam"),("ZA","South Africa"),
    ]
    opts = "".join(f'<option value="{code}">{name}</option>' for code,name in countries)
    
    new_html = '<input type="text" id="modalCountry" list="countryDatalist" autocomplete="off" placeholder="Start typing your country..." style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%"><datalist id="countryDatalist">'+opts+'</datalist>'
    
    c = c[:sel_start] + new_html + c[sel_end:]
    print('Converted modal select to searchable input')
else:
    print('Could not find modalCountry select')

# 3. Add country code mapping in JS before the fetch
# Find: var mc=document.getElementById("modalCountry");if(mc&&mc.value){fetch
old_fetch = 'var mc=document.getElementById("modalCountry");if(mc&&mc.value){fetch("/api/country"'
# Build JS country code map
code_map_js = "{" + ",".join(f'"{name.lower()}":"{code}"' for code,name in [
    ("TR","Turkey"),("US","United States"),("GB","United Kingdom"),
    ("DE","Germany"),("FR","France"),("IT","Italy"),("ES","Spain"),
    ("NL","Netherlands"),("CA","Canada"),("AU","Australia"),
    ("JP","Japan"),("KR","South Korea"),("IN","India"),
    ("BR","Brazil"),("MX","Mexico"),("AR","Argentina"),
    ("AT","Austria"),("BE","Belgium"),("CL","Chile"),
    ("CN","China"),("CO","Colombia"),("CZ","Czech Republic"),
    ("DK","Denmark"),("EG","Egypt"),("FI","Finland"),
    ("GR","Greece"),("HU","Hungary"),("ID","Indonesia"),
    ("IE","Ireland"),("IL","Israel"),("MY","Malaysia"),
    ("NG","Nigeria"),("NO","Norway"),("NZ","New Zealand"),
    ("PH","Philippines"),("PK","Pakistan"),("PL","Poland"),
    ("PT","Portugal"),("RO","Romania"),("RU","Russia"),
    ("SA","Saudi Arabia"),("SE","Sweden"),("SG","Singapore"),
    ("TH","Thailand"),("UA","Ukraine"),("VN","Vietnam"),("ZA","South Africa"),
]) + "}"
new_fetch = f'var mc=document.getElementById("modalCountry");if(mc&&mc.value){{var cm={code_map_js};var cv=cm[(mc.value||"").toLowerCase()]||mc.value;fetch("/api/country"'

c = c.replace(old_fetch, new_fetch)
print('Added country code mapping')

with open('templates/index.html','w',encoding='utf-8') as f:
    f.write(c)
print('ALL DONE')