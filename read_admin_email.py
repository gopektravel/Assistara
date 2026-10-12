with open('assistara-local-v9/admin-email.html', encoding='utf-8') as f:
    lines = f.read().split('\n')
for i in range(410, min(520, len(lines))):
    s = lines[i][:250]
    print(f'{i+1:3d}: {s}')