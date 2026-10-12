keys = [
  "academy_application_confirmation","internal_new_application",
  "academy_application_accepted","academy_application_waitlisted",
  "academy_onboarding","academy_payment_confirmation",
  "academy_waitlist_seat_opened","masterclass_reminder_24h",
  "masterclass_followup","masterclass_reminder_30","masterclass_reminder_5",
  "masterclass_registration_confirmation"
]
with open('update_real_templates.sql', 'w', encoding='utf-8') as out:
    out.write("BEGIN;\n")
    for k in keys:
        try:
            with open('recovered_' + k + '.html', encoding='utf-8') as f: html = f.read()
            with open('recovered_' + k + '.subject.txt', encoding='utf-8') as f: sub = f.read()
            with open('recovered_' + k + '.text.txt', encoding='utf-8') as f: text = f.read()
        except Exception as e:
            out.write(f"-- BLOCKED: {k} (file missing: {e})\n")
            continue
        safe_html = html.replace("'", "''")
        safe_sub = sub.replace("'", "''")
        safe_text = (text[:500] if text else '').replace("'", "''")
        out.write(f"UPDATE email_templates SET html = '{safe_html[:6000]}', subject = '{safe_sub[:300]}', text_content = '{safe_text[:500]}', status = 'draft', version = 2, updated_at = now() WHERE key = '{k}';\n")
    out.write("COMMIT;\n")
print("Wrote update_real_templates.sql (12 updates)")
