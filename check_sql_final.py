with open('import_active_drafts.sql', encoding='utf-8') as f:
    lines = f.read().split('\n')
line = lines[2]
print('Length:', len(line))
print('Ends with CONFLICT?', line.endswith('ON CONFLICT (key) DO NOTHING;'))
print('Contains safe text_content?', "Template content" in line)
print('Contains broken single quote?', "Template '" in line)
