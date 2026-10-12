with open('assistara-local-v9/admin-email.html', encoding='utf-8') as f:
    c = f.read()
with open('assistara-local-v9/admin.html', encoding='utf-8') as f:
    h = f.read()
checks = [
    ("reminder30 removed from TABS", '["reminder30"' not in c),
    ("30-Min Reminder button in Campaigns", 'open-reminder30' in c),
    ("Button wired to renderReminder30", 'renderReminder30' in c),
    ("Email tool chrome title cleared", 'title: ""' in h),
]
for name, result in checks:
    print(f"{name}: {'PASS' if result else 'FAIL'}")
