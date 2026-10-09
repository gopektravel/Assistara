content = open('assistara-local-v9/academy-apply.html', encoding='utf-8').read()
checks = {
    'banner': 'soldoutSection' in content,
    'heading': 'Oops, our first cohort is full!' in content,
    'copy1': "All 15 spots for Assistara Academy" in content,
    'copy2': "We'd still love to have you!" in content,
    'cta': 'Join the Priority Waitlist' in content,
    'consent': 'I agree to receive notifications' in content,
    'pricing_mentioned': '₱' in content or 'pricing' in content.lower() or 'cost' in content.lower(),
}
for k, v in checks.items():
    print(k + ':', v)
