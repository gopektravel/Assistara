with open('assistara-local-v9/academy-dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Find ALL occurrences of "Community joined" text
matches = [(m.start(), content[max(0,m.start()-100):m.end()+100]) for m in re.finditer(r'Community joined', content)]
print(f"Found {len(matches)} occurrences of 'Community joined':")
for i, (pos, ctx) in enumerate(matches):
    print(f"\n--- Occurrence {i+1} at char {pos} ---")
    print(ctx)

# Find ALL checkbox inputs
print("\n\n=== ALL checkbox inputs ===")
for m in re.finditer(r'<input[^>]*type="checkbox"[^>]*>', content):
    print(f"  {m.group()[:200]}")

# Find previewControls innerHTML content
print("\n\n=== previewControls innerHTML ===")
m = re.search(r'previewControls["\']?\)\.innerHTML\s*=\s*[\'"](.*?)[\'"]', content, re.DOTALL)
if m:
    inner = m.group(1)
    print(f"Length: {len(inner)}")
    print(f"Has checkbox: {'checkbox' in inner}")
    print(f"Has Community joined: {'Community joined' in inner}")
    # Show first 500 chars
    print(f"First 300 chars: {inner[:300]}")
