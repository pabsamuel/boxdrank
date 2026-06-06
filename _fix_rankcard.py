with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# ONLY remove the rank card country select dropdown
# Find: sh.innerHTML+=`<div class="country-select"...</select></div>`;
start_marker = '<div class="country-select"'
end_marker = '</select></div>`;'

idx = c.find(start_marker)
if idx > 0:
    end = c.find(end_marker, idx) + len(end_marker)
    c = c[:idx] + c[end:]
    print("Removed rank card country dropdown")

# Remove saveCountry function
old_func = "async function saveCountry(){const c=document.getElementById('countrySelect').value;if(!c||!curUser)return;try{await fetch('/api/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:curUser,country:c})});toast('Country set!')}catch{toast('Failed')}}"
c = c.replace(old_func, '')
print("Removed saveCountry")

# Reset lbLoaded after new rank check
c = c.replace(
    "buildShare(curUser,rank);rs.scrollIntoView",
    "buildShare(curUser,rank);lbLoaded=false;rs.scrollIntoView"
)
print("Added lbLoaded reset")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("Select Country count:", c.count('Select Country'))
print("All Countries count:", c.count('All Countries'))
print("DONE")