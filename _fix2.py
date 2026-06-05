import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix renderLB: use avatar_url instead of colored circles
# Old: avatarCell uses avatar_url already, but renderLB doesn't use it correctly
# Let me just check current renderLB
idx = c.find('function renderLB')
end = c.find('async function loadMoreLB', idx)
render_func = c[idx:end]
print("Current renderLB length:", len(render_func))
print("Has avatarCell:", 'avatarCell' in render_func)
print("Has avatar_url:", 'avatar_url' in render_func)
print("Has lb-av:", 'lb-av' in render_func)