with open('assistara-local-v9/admin-email.html', 'r', encoding='utf-8') as f:
    content = f.read()
import re
tabs = re.findall(r'data-tab="([^"]+)"', content)
print('Tab IDs found:', tabs)