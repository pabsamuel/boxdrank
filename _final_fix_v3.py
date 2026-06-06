with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Check current state
print("modalCountry exists:", 'modalCountry' in c)
print("Select Country:", c.count('Select Country'))
print("All Countries:", c.count('All Countries'))

# The problem: leaderboard has 2 country dropdowns side by side.
# We need to KEEP the modal dropdown, REMOVE the LB dropdown that JS creates.
# The _fix_final_v2.py removed the modal dropdown - we need to UNDO that.

# 1. RESTORE modal country dropdown in the HTML
# Check if modal dropdown was removed
privacy_line = '<p class="privacy">Public data only · No login required</p>'
idx = c.find(privacy_line)
if idx > 0:
    after_privacy = c[idx+len(privacy_line):idx+len(privacy_line)+200]
    print("After privacy:", repr(after_privacy[:80]))

# If modal dropdown is missing, restore it from git
if 'modalCountry' not in c:
    print("Modal dropdown missing - restoring from git")
    import subprocess
    subprocess.run(['git', 'checkout', '383872e', '--', 'templates/index.html'], 
                   capture_output=True, cwd='.')
    
    # Re-read the file
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        c = f.read()
    print("Restored from git. modalCountry:", 'modalCountry' in c)

# 2. REMOVE the LB JS-created country dropdown (the cs.createElement one)
# We only want ONE country dropdown in the leaderboard
start = "var cs=document.createElement('select');cs.style.cssText='padding:6px 12px;border-radius:16px;border:1px solid var(--b);background:0;color:var(--t2);font-size:.7rem;font-weight:600;cursor:pointer;margin-left:4px;max-width:160px';cs.innerHTML='"
end_marker = "cs.value='';document.getElementById('lbFilters').appendChild(cs);await fetchLB();lbLoaded=true;"
if start in c:
    # Find the full block
    idx_start = c.find(start)
    idx_end = c.find(end_marker, idx_start) + len(end_marker)
    c = c[:idx_start] + c[idx_end:]
    print("Removed LB JS country dropdown")

# 3. REMOVE filterLBCountry function
c = c.replace("async function filterLBCountry(cn){lbCountry=cn;lbTier=null;loadLB();lbLoaded=false}", "")
print("Removed filterLBCountry")

# 4. REMOVE lbCountry variable
c = c.replace("let lbCountry=null;", "")
print("Removed lbCountry variable")

# 5. Remove lbCountry from fetchLB
c = c.replace(";if(lbCountry)u+=`&country=${lbCountry}`", "")
print("Removed lbCountry from fetchLB")

# 6. Add lbLoaded reset after showResult
c = c.replace(
    "buildShare(curUser,rank);rs.scrollIntoView",
    "buildShare(curUser,rank);lbLoaded=false;rs.scrollIntoView"
)
print("Added lbLoaded reset")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("\nFINAL STATE:")
print("modalCountry:", c.count('modalCountry'))
print("Select Country:", c.count('Select Country')) 
print("All Countries:", c.count('All Countries'))
print("filterLBCountry:", 'filterLBCountry' in c)
print("lbCountry:", 'lbCountry' in c)
print("DONE")