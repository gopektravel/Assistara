with open('assistara-local-v9/admin-template-studio.html', encoding='utf-8') as f:
    content = f.read()
print('top.location references:', content.count('top.location'))
print('window.parent references:', content.count('window.parent'))
print('showPanel calls:', content.count('showPanel'))
for line in content.split('\n'):
    if 'API_URL' in line and 'const' in line:
        print('API_URL line:', line.strip()[:150])
print()
print('Panel elements:')
import re
panels = re.findall(r'id="panel-([a-z]+)"', content)
print(' ', panels)
print()
print('Manrope Google Fonts link:', 'fonts.googleapis.com/css2?family=Manrope' in content)
print('assistara_admin_token read:', "assistara_admin_token" in content)
print('Authorization Bearer:', "Authorization: 'Bearer ' + token" in content)
print('401 redirect to /admin:', "location.href = '/admin'" in content)
