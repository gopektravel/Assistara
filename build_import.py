keys = [
  ("academy_application_confirmation","Academy application confirmation","transactional"),
  ("internal_new_application","Internal new app notification","internal"),
  ("academy_application_accepted","Application accepted","transactional"),
  ("academy_application_waitlisted","Application not selected","transactional"),
  ("academy_onboarding","Onboarding / account setup","transactional"),
  ("academy_payment_confirmation","Payment confirmation","transactional"),
  ("academy_waitlist_seat_opened","Waitlist seat opened","transactional"),
  ("masterclass_reminder_24h","Masterclass 24h reminder","campaign"),
  ("masterclass_followup","Masterclass follow-up","campaign"),
  ("masterclass_reminder_30","Masterclass 30min reminder","campaign"),
  ("masterclass_reminder_5","Masterclass 5min reminder","campaign"),
  ("masterclass_registration_confirmation","Masterclass registration confirmation","campaign"),
]
insert_sql = "\n".join([
  f"INSERT INTO email_templates (key, name, category, status, version, created_by, html, subject, preview_text, is_critical) VALUES ('{k}','{n}','{c}','draft',1,'admin','<!doctype html><html><body>Template {k}</body></html>','Confirm your Assistara Academy enrollment','Your Academy application',false) ON CONFLICT (key) DO NOTHING;"
  for k,n,c in keys
])
with open("import_active_drafts.sql", "w") as f:
    f.write("-- Import 12 active templates as drafts (ON CONFLICT DO NOTHING preserves existing)\nBEGIN;\n")
    f.write(insert_sql)
    f.write("\nCOMMIT;\n")
print("Wrote import_active_drafts.sql (12 inserts, protected by ON CONFLICT DO NOTHING)")
