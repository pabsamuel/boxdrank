# Final fix: remove country buttons, keep only searchable dropdown with ALL countries
with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# All countries (ISO codes + flags + names)  
ALL_COUNTRIES = [
    ("TR", "🇹🇷", "Turkey"), ("US", "🇺🇸", "United States"), ("GB", "🇬🇧", "United Kingdom"),
    ("DE", "🇩🇪", "Germany"), ("FR", "🇫🇷", "France"), ("IT", "🇮🇹", "Italy"),
    ("ES", "🇪🇸", "Spain"), ("NL", "🇳🇱", "Netherlands"), ("CA", "🇨🇦", "Canada"),
    ("AU", "🇦🇺", "Australia"), ("JP", "🇯🇵", "Japan"), ("KR", "🇰🇷", "South Korea"),
    ("IN", "🇮🇳", "India"), ("BR", "🇧🇷", "Brazil"), ("MX", "🇲🇽", "Mexico"),
    ("AR", "🇦🇷", "Argentina"), ("AT", "🇦🇹", "Austria"), ("BE", "🇧🇪", "Belgium"),
    ("CL", "🇨🇱", "Chile"), ("CN", "🇨🇳", "China"), ("CO", "🇨🇴", "Colombia"),
    ("CZ", "🇨🇿", "Czech Republic"), ("DK", "🇩🇰", "Denmark"), ("EG", "🇪🇬", "Egypt"),
    ("FI", "🇫🇮", "Finland"), ("GR", "🇬🇷", "Greece"), ("HK", "🇭🇰", "Hong Kong"),
    ("HU", "🇭🇺", "Hungary"), ("ID", "🇮🇩", "Indonesia"), ("IE", "🇮🇪", "Ireland"),
    ("IL", "🇮🇱", "Israel"), ("MY", "🇲🇾", "Malaysia"), ("NG", "🇳🇬", "Nigeria"),
    ("NO", "🇳🇴", "Norway"), ("NZ", "🇳🇿", "New Zealand"), ("PE", "🇵🇪", "Peru"),
    ("PH", "🇵🇭", "Philippines"), ("PK", "🇵🇰", "Pakistan"), ("PL", "🇵🇱", "Poland"),
    ("PT", "🇵🇹", "Portugal"), ("RO", "🇷🇴", "Romania"), ("RU", "🇷🇺", "Russia"),
    ("SA", "🇸🇦", "Saudi Arabia"), ("SE", "🇸🇪", "Sweden"), ("SG", "🇸🇬", "Singapore"),
    ("TH", "🇹🇭", "Thailand"), ("TW", "🇹🇼", "Taiwan"), ("UA", "🇺🇦", "Ukraine"),
    ("VN", "🇻🇳", "Vietnam"), ("ZA", "🇿🇦", "South Africa"),
]

js_countries = "[" + ",".join(f'["{c}","{f} {n}"]' for c,f,n in ALL_COUNTRIES) + "]"

# Build the clean select HTML with all countries including "All" as first  
select_opts = '<option value="">🌍 All Countries</option>' + "".join(
    f'<option value="{c}">{f} {n}</option>' for c,f,n in ALL_COUNTRIES
)

# Build JS replacement for loadLB — clean single dropdown, no buttons  
loadLB_fix = """document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map(n=>{const act=(n==='All'&&!lbTier)||n===lbTier;return`<button class=\"lb-filter${act?' active':''}\" onclick=\"filterLBTier('${n}')\">${n}</button>`}).join('');var cs=document.createElement('select');cs.style.cssText='padding:6px 12px;border-radius:16px;border:1px solid var(--b);background:0;color:var(--t2);font-size:.7rem;font-weight:600;cursor:pointer;margin-left:4px;max-width:180px';cs.innerHTML='""" + select_opts.replace("'", "\\'") + """';cs.onchange=function(){filterLBCountry(this.value||null)};cs.value=lbCountry||'';document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true"""

# 1. Replace the bloated loadLB code with clean version  
old_loadLB = "document.getElementById('lbFilters').innerHTML=['🌍 All',...TIERS.map(t=>t.n).reverse()].map(n=>{const act=(n==='All'&&!lbTier&&!lbCountry)||(n===lbTier&&!lbCountry);return`<button class=\"lb-filter${act?' active':''}\" onclick=\"filterLBTier('${n}')\">${n}</button>`}).join('')"
c = c.replace(old_loadLB, loadLB_fix)

# 2. Remove the countryFilterRow creation section entirely  
old_row = "var cc=document.getElementById('countryFilterRow');if(!cc){cc=document.createElement('div');cc.id='countryFilterRow';cc.style.cssText='display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;justify-content:center';var fdiv=document.getElementById('lbFilters');fdiv.parentNode.insertBefore(cc,fdiv.nextSibling)}var countries=[['TR','🇹🇷 TR'],['US','🇺🇸 US'],['GB','🇬🇧 UK'],['DE','🇩🇪 DE'],['FR','🇫🇷 FR'],['IT','🇮🇹 IT'],['ES','🇪🇸 ES'],['NL','🇳🇱 NL'],['CA','🇨🇦 CA'],['AU','🇦🇺 AU'],['JP','🇯🇵 JP'],['KR','🇰🇷 KR'],['IN','🇮🇳 IN'],['BR','🇧🇷 BR'],['MX','🇲🇽 MX']];cc.innerHTML=countries.map(cn=>{var a=cn[0]===lbCountry;return`<button class=\"lb-filter${a?' active':''}\" onclick=\"filterLBCountry('${cn[0]}')\">${cn[1]}</button>`}).join('')+`<button class=\"lb-filter\" onclick=\"filterLBCountry(null)\">🌍 All</button>`;document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map(n=>{const act=(n==='All'&&!lbTier)||n===lbTier;return`<button class=\"lb-filter${act?' active':''}\" onclick=\"filterLBTier('${n}')\">${n}</button>`}).join('')"
c = c.replace(old_row, "")

# 3. Update modal country dropdown with ALL countries  
old_modal_select = '<p class="privacy">Public data only · No login required</p><div style="margin-top:12px"><select id="modalCountry" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%"><option value="">🌍 Select Your Country (optional)</option><option value="TR">🇹🇷 Turkey</option><option value="US">🇺🇸 United States</option><option value="GB">🇬🇧 United Kingdom</option><option value="DE">🇩🇪 Germany</option><option value="FR">🇫🇷 France</option><option value="IT">🇮🇹 Italy</option><option value="ES">🇪🇸 Spain</option><option value="NL">🇳🇱 Netherlands</option><option value="CA">🇨🇦 Canada</option><option value="AU">🇦🇺 Australia</option><option value="JP">🇯🇵 Japan</option><option value="KR">🇰🇷 South Korea</option><option value="IN">🇮🇳 India</option><option value="BR">🇧🇷 Brazil</option><option value="MX">🇲🇽 Mexico</option></select></div>'

new_modal_select = '<p class="privacy">Public data only · No login required</p><div style="margin-top:12px"><select id="modalCountry" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%">' + select_opts + '</select></div>'

c = c.replace(old_modal_select, new_modal_select)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("DONE - Clean dropdown with all countries, no buttons")