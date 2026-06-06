with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Remove rank card countrySelect
old1 = 'sh.innerHTML+=`<div class="country-select"'
close1 = '</select></div>`;sh.style.display'
i1 = c.find(old1)
if i1 > 0:
    e1 = c.find(close1, i1)
    c = c[:i1] + 'sh.style.display' + c[e1 + len(close1):]
    print("1. Removed rank card country dropdown")

# 2. Remove saveCountry function
c = c.replace("async function saveCountry(){const c=document.getElementById('countrySelect').value;if(!c||!curUser)return;try{await fetch('/api/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:curUser,country:c})});toast('Country set!')}catch{toast('Failed')}}\n", "")
print("2. Removed saveCountry")

# 3. Add leaderboard country dropdown with "All Countries" option
opts = '<option value="">🌍 All Countries</option>'
for code, label in [
    ("TR","TR Turkey"),("US","US United States"),("GB","UK United Kingdom"),
    ("DE","DE Germany"),("FR","FR France"),("IT","IT Italy"),("ES","ES Spain"),
    ("NL","NL Netherlands"),("CA","CA Canada"),("AU","AU Australia"),
    ("JP","JP Japan"),("KR","KR South Korea"),("IN","IN India"),
    ("BR","BR Brazil"),("MX","MX Mexico"),("AR","AR Argentina"),
    ("AT","AT Austria"),("BE","BE Belgium"),("CN","CN China"),
    ("DK","DK Denmark"),("FI","FI Finland"),("GR","GR Greece"),
    ("ID","ID Indonesia"),("IE","IE Ireland"),("MY","MY Malaysia"),
    ("NO","NO Norway"),("NZ","NZ New Zealand"),("PH","PH Philippines"),
    ("PL","PL Poland"),("PT","PT Portugal"),("RU","RU Russia"),
    ("SE","SE Sweden"),("SG","SG Singapore"),("TH","TH Thailand"),
    ("VN","VN Vietnam"),("ZA","ZA South Africa"),
]:
    opts += f'<option value="{code}">{label}</option>'

old3 = "await fetchLB();lbLoaded=true;"
new3 = "var cs=document.createElement('select');cs.style.cssText='padding:6px 12px;border-radius:16px;border:1px solid var(--b);background:0;color:var(--t2);font-size:.7rem;font-weight:600;cursor:pointer;margin-left:4px;max-width:160px';cs.innerHTML='" + opts + "';cs.onchange=function(){filterLBCountry(this.value||null)};document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true;"
c = c.replace(old3, new3)
print("3. Added leaderboard country dropdown with All option")

# 4. Ensure filterLBCountry exists
if "async function filterLBCountry" not in c:
    c = c.replace(
        "async function filterLBTier(t){lbTier=t==='All'?null:t;loadLB();lbLoaded=false}",
        "async function filterLBTier(t){lbTier=t==='All'?null:t;loadLB();lbLoaded=false}\n    async function filterLBCountry(cn){lbCountry=cn;lbTier=null;loadLB();lbLoaded=false}"
    )
    print("4. Added filterLBCountry")

# 5. lbLoaded reset after showResult
c = c.replace(
    "buildShare(curUser,rank);rs.scrollIntoView",
    "buildShare(curUser,rank);lbLoaded=false;rs.scrollIntoView"
)
print("5. lbLoaded reset after showResult")

# 6. lbCountry variable
c = c.replace(
    "let lbLoaded=false;",
    "let lbLoaded=false;let lbCountry=null;"
)
print("6. Added lbCountry variable")

# 7. fetchLB uses lbCountry
c = c.replace(
    "let u=`/api/leaderboard?limit=50&offset=0`;if(lbTier)u+=`&tier=${encodeURIComponent(lbTier)}`",
    "let u=`/api/leaderboard?limit=50&offset=0`;if(lbTier)u+=`&tier=${encodeURIComponent(lbTier)}`;if(lbCountry)u+=`&country=${lbCountry}`"
)
print("7. fetchLB uses country filter")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("ALL DONE")