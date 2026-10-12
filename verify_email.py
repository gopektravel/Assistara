with open('assistara-local-v9/admin-email.html', encoding='utf-8') as f:
    content = f.read()
import re
tabs = re.findall(r'\["([a-z0-9-]+)",\s*"([^"]+)"\]', content)
print('TABS entries:')
for t in tabs:
    print(' ', t)
print()
print('renderTemplateStudio present:', 'renderTemplateStudio' in content)
print('iframe src=/admin-template-studio.html:', 'src="/admin-template-studio.html"' in content)
print('RENDER has template-studio:', '"template-studio": renderTemplateStudio' in content)
print('Manrope declarations only:', 'font-family:"Manrope"' in content)
