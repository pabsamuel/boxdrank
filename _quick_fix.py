with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. After showResult, reset lbLoaded so leaderboard refreshes on next visit
old = "buildShare(curUser,rank);rs.scrollIntoView({behavior:'smooth',block:'start'})}"
new = "buildShare(curUser,rank);lbLoaded=false;rs.scrollIntoView({behavior:'smooth',block:'start'})}"
if old in c:
    c = c.replace(old, new)
    print("1. ✅ Leaderboard will refresh after new rank check")
else:
    print("1. ❌ Could not find showResult end")

# 2. Add "All" option to leaderboard country dropdown  
# Find the select creation: cs.innerHTML=
old2 = "cs.innerHTML='"
new2 = "cs.innerHTML='<option value=\"\">🌍 All Countries</option>'+" 
if old2 in c:
    c = c.replace(old2, new2)
    print("2. ✅ Added All Countries option to leaderboard dropdown")
else:
    print("2. ❌ Could not find cs.innerHTML")

# 3. Fix filterLBCountry to properly reload with lbLoaded=false
# Find filterLBCountry function - make sure it works
old3 = "async function filterLBCountry(cn){lbCountry=cn;lbTier=null;loadLB();lbLoaded=false}"
if old3 in c:
    print("3. ✅ filterLBCountry exists and correct")
else:
    print("3. ❌ filterLBCountry missing, adding it")
    # Add it before the next function
    c = c.replace(
        "async function filterLBTier(t){lbTier=t==='All'?null:t;lbCountry=null;loadLB();lbLoaded=false}",
        "async function filterLBTier(t){lbTier=t==='All'?null:t;lbCountry=null;loadLB();lbLoaded=false}\n    async function filterLBCountry(cn){lbCountry=cn;lbTier=null;loadLB();lbLoaded=false}"
    )
    print("3. ✅ Added filterLBCountry")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("ALL DONE")