import re

# 3. Update index.html - add country dropdown, country filter buttons, and country API calls
with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Add country dropdown to share row - after "Connect X" button
old_connect_x = "sh.innerHTML+=`<div class=\"connect-x-form\" id=\"cxForm\"><div class=\"cx-box\"><input type=\"text\" id=\"cxInput\" placeholder=\"X handle (e.g. elonmusk)\"><button onclick=\"saveCX()\">Link</button></div></div>`"
new_country = "sh.innerHTML+=`<div class=\"connect-x-form\" id=\"cxForm\"><div class=\"cx-box\"><input type=\"text\" id=\"cxInput\" placeholder=\"X handle (e.g. elonmusk)\"><button onclick=\"saveCX()\">Link</button></div></div>`;sh.innerHTML+=`<div class=\"country-select\" style=\"margin-top:8px;text-align:center;\"><select id=\"countrySelect\" onchange=\"saveCountry()\" style=\"padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;max-width:200px;\"><option value=\"\">🌍 Select Country</option><option value=\"TR\">🇹🇷 Turkey</option><option value=\"US\">🇺🇸 United States</option><option value=\"GB\">🇬🇧 United Kingdom</option><option value=\"DE\">🇩🇪 Germany</option><option value=\"FR\">🇫🇷 France</option><option value=\"IT\">🇮🇹 Italy</option><option value=\"ES\">🇪🇸 Spain</option><option value=\"NL\">🇳🇱 Netherlands</option><option value=\"CA\">🇨🇦 Canada</option><option value=\"AU\">🇦🇺 Australia</option><option value=\"JP\">🇯🇵 Japan</option><option value=\"KR\">🇰🇷 South Korea</option><option value=\"IN\">🇮🇳 India</option><option value=\"BR\">🇧🇷 Brazil</option><option value=\"MX\">🇲🇽 Mexico</option></select></div>`"
c = c.replace(old_connect_x, new_country)

# Add saveCountry function before the lbLoaded line
old_lb_loaded = "\n    let lbLoaded=false;"
new_save_country = """async function saveCountry(){const c=document.getElementById('countrySelect').value;if(!c||!curUser)return;try{await fetch('/api/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:curUser,country:c})});toast('Country set!')}catch{toast('Failed')}}
""" + old_lb_loaded
c = c.replace(old_lb_loaded, new_save_country)

# Add country filter buttons to loadLB
old_lb_filters = "document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map"
new_lb_filters = """document.getElementById('lbFilters').innerHTML=['🌍 All',...TIERS.map(t=>t.n).reverse()].map(n=>{const act=(n==='All'&&!lbTier&&!lbCountry)||(n===lbTier&&!lbCountry);return`<button class=\"lb-filter${act?' active':''}\" onclick=\"filterLBTier('${n}')\">${n}</button>`}).join('');var cc=document.getElementById('countryFilterRow');if(!cc){cc=document.createElement('div');cc.id='countryFilterRow';cc.style.cssText='display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;justify-content:center';var fdiv=document.getElementById('lbFilters');fdiv.parentNode.insertBefore(cc,fdiv.nextSibling)}var countries=[['TR','🇹🇷 TR'],['US','🇺🇸 US'],['GB','🇬🇧 UK'],['DE','🇩🇪 DE'],['FR','🇫🇷 FR'],['IT','🇮🇹 IT'],['ES','🇪🇸 ES'],['NL','🇳🇱 NL'],['CA','🇨🇦 CA'],['AU','🇦🇺 AU'],['JP','🇯🇵 JP'],['KR','🇰🇷 KR'],['IN','🇮🇳 IN'],['BR','🇧🇷 BR'],['MX','🇲🇽 MX']];cc.innerHTML=countries.map(cn=>{var a=cn[0]===lbCountry;return`<button class=\"lb-filter${a?' active':''}\" onclick=\"filterLBCountry('${cn[0]}')\">${cn[1]}</button>`}).join('')+`<button class=\"lb-filter\" onclick=\"filterLBCountry(null)\">🌍 All</button>`"""
# Use simpler replace
c = c.replace(
    "document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map",
    new_lb_filters + ";document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map"
)

# Add lbCountry variable and filterLBCountry function
old_lb_tier_null = "let lbLoaded=false;"
new_lb_country = "let lbLoaded=false;let lbCountry=null;"
c = c.replace(old_lb_tier_null, new_lb_country)

# Add filterLBCountry function
old_filter_tier = "async function filterLBTier(t){lbTier=t==='All'?null:t;loadLB();lbLoaded=false}"
new_filter_country = """async function filterLBTier(t){lbTier=t==='All'?null:t;lbCountry=null;loadLB();lbLoaded=false}
    async function filterLBCountry(cn){lbCountry=cn;lbTier=null;loadLB();lbLoaded=false}"""
c = c.replace(old_filter_tier, new_filter_country)

# Update fetchLB to use country param
old_fetch_lb = "let u=`/api/leaderboard?limit=50&offset=0`;if(lbTier)u+=`&tier=${encodeURIComponent(lbTier)}`"
new_fetch_lb = "let u=`/api/leaderboard?limit=50&offset=0`;if(lbTier)u+=`&tier=${encodeURIComponent(lbTier)}`;if(lbCountry)u+=`&country=${lbCountry}`"
c = c.replace(old_fetch_lb, new_fetch_lb)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("index.html updated with country features")