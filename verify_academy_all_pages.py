files = {
    'index.html': open('assistara-local-v9/index.html', encoding='utf-8').read(),
    'academy.html': open('assistara-local-v9/academy.html', encoding='utf-8').read(),
    'academy-apply.html': open('assistara-local-v9/academy-apply.html', encoding='utf-8').read(),
}
for name, content in files.items():
    has_academy = 'academy' in content.lower()
    has_waitlist = 'waitlist' in content.lower()
    has_soldout = 'soldout' in content.lower() or 'full!' in content.lower() or 'Oops' in content
    print(f"{name}: academy={has_academy}, waitlist={has_waitlist}, soldout={has_soldout}")
