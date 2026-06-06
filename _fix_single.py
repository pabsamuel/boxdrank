with open('templates/index.html','r',encoding='utf-8') as f:
    c = f.read()

# 1. Remove rank card's countrySelect dropdown
old_rank_select = 'sh.innerHTML+=`<div class="country-select" style="margin-top:8px;text-align:center;"><select id="countrySelect" onchange="saveCountry()" style="padding:8px 12px;border-radius:6px;border:1px solid var(--b);background:var(--s);color:var(--t);font-size:.82rem;max-width:200px;">'
close_tag = '</select></div>`;'
idx = c.find(old_rank_select)
if idx > 0:
    end = c.find(close_tag, idx) + len(close_tag)
    c = c[:idx] + c[end:]
    print("1. ❌ Removed rank card country dropdown")

# 2. Remove leaderboard's country dropdown (cs.createElement select)
start_lb = "var cs=document.createElement('select');cs.style.cssText='padding:6px 12px;border-radius:16px;border:1px solid var(--b);background:0;color:var(--t2);font-size:.7rem;font-weight:600;cursor:pointer;margin-left:4px;max-width:180px';cs.innerHTML='"
end_lb = "cs.value=lbCountry||'';document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true"
idx2 = c.find(start_lb)
if idx2 > 0:
    end2 = c.find(end_lb, idx2) + len(end_lb)
    c = c[:idx2] + c[end2:]
    print("2. ❌ Removed leaderboard country dropdown")

# 3. Remove saveCountry function
c = c.replace("async function saveCountry(){const c=document.getElementById('countrySelect').value;if(!c||!curUser)return;try{await fetch('/api/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:curUser,country:c})});toast('Country set!')}catch{toast('Failed')}}\n", "")
print("3. ❌ Removed saveCountry function")

# 4. Remove filterLBCountry function
old_flb = "async function filterLBCountry(cn){lbCountry=cn;lbTier=null;loadLB();lbLoaded=false}"
c = c.replace(old_flb, "")
print("4. ❌ Removed filterLBCountry")

# 5. Remove lbCountry references and reset lbLoaded fix
c = c.replace("let lbLoaded=false;let lbCountry=null;", "let lbLoaded=false;")
# Replace filterLBTier to remove lbCountry
c = c.replace("async function filterLBTier(t){lbTier=t==='All'?null:t;lbCountry=null;loadLB();lbLoaded=false}",
              "async function filterLBTier(t){lbTier=t==='All'?null:t;loadLB();lbLoaded=false}")
# Remove lbCountry from fetchLB URLs
c = c.replace(";if(lbCountry)u+=`&country=${lbCountry}`", "")

with open('templates/index.html','w',encoding='utf-8') as f:
    f.write(c)
print("DONE — Single country dropdown in modal only")