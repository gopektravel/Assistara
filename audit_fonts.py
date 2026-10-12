import os, re

files = [
  'assistara-local-v9/admin.html',
  'assistara-local-v9/admin-email.html',
  'assistara-local-v9/admin-template-studio.html',
  'assistara-local-v9/admin-finance.html',
  'assistara-local-v9/admin-acquisition.html',
  'assistara-local-v9/admin-masterclass-event.html',
  'assistara-local-v9/admin-tokens.css',
  'assistara-local-v9/admin-components.css',
  'assistara-local-v9/admin-charts.css',
  'assistara-local-v9/admin-layout.css',
  'assistara-local-v9/admin-sidebar.css',
  'assistara-local-v9/admin-header.css',
  'assistara-local-v9/styles.css',
  'assistara-local-v9/manrope-lock.css',
]

# Forbidden font NAMES (word-boundary match, case-insensitive)
forbidden = ['arial', 'inter', 'roboto', 'system-ui', 'helvetica', 'dm sans', 'verdana',
             'tahoma', 'segoe ui', 'georgia', 'times new roman', 'calibri', 'trebuchet',
             'lucida', 'garamond', 'courier', 'monospace']

# Allowed: Manrope, generic families, inherit/initial/unset, var(--...)
allowed_generic = {'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'inherit', 'initial', 'unset', 'revert'}

total_bad = 0
for f in files:
    if not os.path.exists(f):
        print(f'== {f}: MISSING')
        continue
    with open(f, encoding='utf-8') as fp:
        content = fp.read()
    # Find all font-family declarations (handle inline styles and CSS)
    decls = re.findall(r'font-family\s*:\s*([^;}\n]+)', content, re.IGNORECASE)
    bad = []
    for d in decls:
        d_clean = d.strip().strip('"\'')
        # Split font list
        parts = [p.strip().strip('"\'').lower() for p in d_clean.split(',')]
        for p in parts:
            if p in allowed_generic or p.startswith('var('):
                continue
            if 'manrope' in p:
                continue
            # check word-boundary forbidden match
            for forb in forbidden:
                if re.search(r'\b' + re.escape(forb) + r'\b', p):
                    bad.append((d_clean, forb))
                    break
    print(f'== {f}: {len(decls)} font-family declarations')
    if bad:
        for d, forb in bad:
            print(f'   BAD ({forb}): font-family: {d}')
        total_bad += len(bad)
    else:
        print('   ALL MANROPE/GENERIC - OK')

print()
print('TOTAL VIOLATIONS:', total_bad)
