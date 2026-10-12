with open('assistara-local-v9/academy-dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Find ALL input elements
print("=== ALL <input> elements ===")
for m in re.finditer(r'<input[^>]*>', content):
    print(f"  {m.group()[:250]}")

# Find ALL occurrences of "checkbox" (case insensitive)
print("\n=== ALL 'checkbox' references ===")
for m in re.finditer(r'checkbox', content, re.IGNORECASE):
    start = max(0, m.start()-80)
    end = min(len(content), m.end()+80)
    print(f"  ...{content[start:end]}...")

# Find the community card HTML
print("\n=== Community card area ===")
idx = content.find('communityCard')
if idx >= 0:
    print(content[idx-200:idx+500])

# Find previewControls div in static HTML
print("\n=== previewControls in static HTML ===")
for m in re.finditer(r'previewControls', content):
    start = max(0, m.start()-50)
    end = min(len(content), m.end()+200)
    print(f"  ...{content[start:end]}...")
    print("---")
