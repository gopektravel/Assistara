with open('supabase/functions/website-form/index.ts', 'r') as f: s = f.read()
marker = '<p><a href="${gcal}"'
if marker in s:
    i = s.index(marker)
    j = s.find('.catch(', i)
    if j > 0:
        s = s[:i] + s[j:]
        with open('supabase/functions/website-form/index.ts', 'w') as f: f.write(s)
        print('cleaned leftover at', i, 'kept .catch at', j)
    else:
        print('.catch not found')
else:
    print('marker not found')
