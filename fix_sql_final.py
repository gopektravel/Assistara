with open('import_active_drafts.sql', encoding='utf-8') as f:
    content = f.read()
# Replace the broken single-quoted text_content values with safe double-quoted or no-quote values
# Actually just replace the broken substring exactly
content = content.replace("'Template 'academy_application_confirmation content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'internal_new_application content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'academy_application_accepted content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'academy_application_waitlisted content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'academy_onboarding content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'academy_payment_confirmation content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'academy_waitlist_seat_opened content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'masterclass_reminder_24h content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'masterclass_followup content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'masterclass_reminder_30 content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'masterclass_reminder_5 content — import draft.'", "'Template content — import draft.'")
content = content.replace("'Template 'masterclass_registration_confirmation content — import draft.'", "'Template content — import draft.'")
with open('import_active_drafts.sql', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed all broken single-quoted text_content values.')
