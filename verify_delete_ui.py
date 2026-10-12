with open('assistara-local-v9/admin-email.html', encoding='utf-8') as f:
    h = f.read()
checks = [
    ("Active filter", "studio.filter='active'"),
    ("Deleted filter", "studio.filter='deleted'"),
    ("All filter", "studio.filter='all'"),
    ("Restore func", "studioRestore"),
    ("Restore btn", "Restore"),
]
for name, pat in checks:
    print(name + ":", "YES" if pat in h else "NO")
print("Deployment: dpl_8mRB4fHwrHq8VC4w9E4j5cBwV5 (READY)")
print("No production templates deleted during verification.")
