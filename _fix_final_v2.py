with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Remove modal country dropdown - the whole div with select
old_start = '<p class="privacy">Public data only · No login required</p><div style="margin-top:12px"><select id="modalCountry"'
old_end = '</select></div>'
idx = c.find(old_start)
if idx > 0:
    end = c.find(old_end, idx) + len(old_end)
    c = c[:idx+len('<p class="privacy">Public data only · No login required</p>')] + c[end:]
    print("Removed modal country dropdown HTML")

# Disable the JS that tries to use modalCountry
c = c.replace(
    'var mc=document.getElementById("modalCountry");if(mc&&mc.value){',
    'var mc=document.getElementById("modalCountry");if(false){'
)
print("Disabled modal country JS")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("DONE")