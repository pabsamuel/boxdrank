with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# All countries
sel = '<option value="">🌍 All Countries</option>'
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
    sel += f'<option value="{code}">{flag} {name}</option>'

# 1. Fix modal country dropdown
c = c.replace(
    '<p class="privacy">Public data only · No login required</p><div style="margin-top:12px"><select id="modalCountry" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%"><option value="">🌍 Select Your Country (optional)</option>',
    '<p class="privacy">Public data only · No login required</p><div style="margin-top:12px"><select id="modalCountry" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%">' + sel + '</select></div>'
)

# 2. Fix leaderboard dropdown — replace old innerHTML with all-countries version
# Find the old dropdown section
start = c.find("var cs=document.createElement('select');cs.style.cssText='")
if start >= 0:
    # Find the end stretch
    end_marker = "cs.value=lbCountry||'';document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true"
    end = c.find(end_marker, start)
    if end >= 0:
        full_old = c[start:end + len(end_marker)]
        # Build new version with all countries
        sel_escaped = sel.replace("'", "\\'")
        new_full = f"var cs=document.createElement('select');cs.style.cssText='padding:6px 12px;border-radius:16px;border:1px solid var(--b);background:0;color:var(--t2);font-size:.7rem;font-weight:600;cursor:pointer;margin-left:4px;max-width:180px';cs.innerHTML='{sel_escaped}';cs.onchange=function(){{filterLBCountry(this.value||null)}};cs.value=lbCountry||'';document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true"
        c = c.replace(full_old, new_full, 1)
        print("Fixed leaderboard dropdown")
    else:
        print("Could not find end marker")
else:
    print("Could not find start of dropdown")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("DONE")