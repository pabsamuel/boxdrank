with open('templates/index.html','r',encoding='utf-8') as f:
    c = f.read()

# 1. Add country dropdown to connect modal (after privacy text)
c = c.replace(
    '<p class="privacy">Public data only · No login required</p>',
    '<p class="privacy">Public data only · No login required</p><div style="margin-top:12px"><select id="modalCountry" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;width:100%"><option value="">🌍 Select Country (optional)</option><option value="TR">🇹🇷 Turkey</option><option value="US">🇺🇸 United States</option><option value="GB">🇬🇧 United Kingdom</option><option value="DE">🇩🇪 Germany</option><option value="FR">🇫🇷 France</option><option value="IT">🇮🇹 Italy</option><option value="ES">🇪🇸 Spain</option><option value="NL">🇳🇱 Netherlands</option><option value="CA">🇨🇦 Canada</option><option value="AU">🇦🇺 Australia</option><option value="JP">🇯🇵 Japan</option><option value="KR">🇰🇷 South Korea</option><option value="IN">🇮🇳 India</option><option value="BR">🇧🇷 Brazil</option><option value="MX">🇲🇽 Mexico</option></select></div>'
)

# 2. Save country after successful lookup (after set curUser) + save to DB
c = c.replace(
    'curData=d;curUser=u;setTimeout(()=>{closeModal();playReveal(d)},1600)',
    'curData=d;curUser=u;var mc=document.getElementById("modalCountry");if(mc&&mc.value){fetch("/api/country",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,country:mc.value})})}setTimeout(()=>{closeModal();playReveal(d)},1600)'
)

# 3. Replace country button row with a simple select next to tier filters
old = "document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map(n=>{const act=(n==='All'&&!lbTier)||n===lbTier;return`<button class=\"lb-filter${act?' active':''}\" onclick=\"filterLBTier('${n}')\">${n}</button>`}).join('');await fetchLB();lbLoaded=true"
new = """document.getElementById('lbFilters').innerHTML=['All',...TIERS.map(t=>t.n).reverse()].map(n=>{const act=(n==='All'&&!lbTier)||n===lbTier;return`<button class=\"lb-filter${act?' active':''}\" onclick=\"filterLBTier('${n}')\">${n}</button>`}).join('');var cs=document.createElement('select');cs.style.cssText='padding:6px 12px;border-radius:16px;border:1px solid var(--b);background:0;color:var(--t2);font-size:.7rem;font-weight:600;cursor:pointer;margin-left:4px';cs.innerHTML='<option value=\"\">🌍 Country</option>'+[['TR','🇹🇷 TR'],['US','🇺🇸 US'],['GB','🇬🇧 UK'],['DE','🇩🇪 DE'],['FR','🇫🇷 FR'],['IT','🇮🇹 IT'],['ES','🇪🇸 ES'],['NL','🇳🇱 NL'],['CA','🇨🇦 CA'],['AU','🇦🇺 AU'],['JP','🇯🇵 JP'],['KR','🇰🇷 KR'],['IN','🇮🇳 IN'],['BR','🇧🇷 BR'],['MX','🇲🇽 MX']].map(cn=>'<option value=\"'+cn[0]+'\">'+cn[1]+'</option>').join('');cs.onchange=function(){filterLBCountry(this.value||null)};cs.value=lbCountry||'';document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true"""
c = c.replace(old, new)

with open('templates/index.html','w',encoding='utf-8') as f:
    f.write(c)

print("DONE - country in modal + dropdown filter")