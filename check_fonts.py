with open('assistara-local-v9/admin-email.html', encoding='utf-8') as f:
    c = f.read()
with open('assistara-local-v9/admin.html', encoding='utf-8') as f:
    h = f.read()
print('Manrope in admin-email.html:', 'Manrope' in c)
print('Manrope in admin.html:', 'Manrope' in h)
for name, content in [('admin-email.html', c), ('admin.html', h)]:
    for bad in ['Inter', 'Arial', 'DM Sans']:
        if bad in content:
            print(f'WARNING: {bad} found in {name}')
print('Font check complete')
