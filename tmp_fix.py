p='assistara-local-v9/admin-tokens.css'
s=open(p,encoding='utf-8').read()
s=s.replace('"Manrope", "DM Sans", sans-serif','"Manrope", sans-serif')
s=s.replace('Manrope everywhere','Manrope as the single official Assistara font')
open(p,'w',encoding='utf-8').write(s)
print('admin-tokens.css updated; DM Sans remains?', 'DM Sans' in s)
