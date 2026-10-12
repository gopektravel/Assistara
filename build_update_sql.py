with open('recovered_academy_application_confirmation.html', encoding='utf-8') as f: html = f.read()
with open('recovered_academy_application_confirmation.subject.txt', encoding='utf-8') as f: sub = f.read()
with open('recovered_academy_application_confirmation.text.txt', encoding='utf-8') as f: text = f.read()
print('Sample recovered (academy_application_confirmation): html=', len(html), 'subject=', sub[:50], 'text=', text[:50])
