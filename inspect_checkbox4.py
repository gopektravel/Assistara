with open('assistara-local-v9/academy-dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Find ALL createElement('input') calls
print("=== ALL createElement('input') calls ===")
for m in re.finditer(r'createElement\([\'"]input[\'"]\)', content):
    start = max(0, m.start()-50)
    end = min(len(content), m.end()+400)
    print(f"\n--- at char {m.start()} ---")
    print(content[start:end])

# Find ALL getElementById('preview...') calls
print("\n\n=== ALL getElementById('preview...') calls ===")
for m in re.finditer(r'getElementById\([\'"](preview[^\'"]*)[\'"]\)', content):
    print(f"  {m.group()}")

# Find ALL .onchange assignments
print("\n\n=== ALL .onchange assignments ===")
for m in re.finditer(r'\.onchange\s*=', content):
    start = max(0, m.start()-80)
    end = min(len(content), m.end()+200)
    print(f"\n--- at char {m.start()} ---")
    print(content[start:end])
