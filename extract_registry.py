import re

with open('supabase/functions/_shared/email-template-registry.ts', encoding='utf-8') as f:
    content = f.read()

# Extract each template definition by finding the key assignments
# Pattern: 'key': { ... render() { return `...` } ... }
# We'll grab the HTML between `return \` and closing \`}

# Find all template blocks by looking for render methods with return templates
keys = [
  'academy_application_confirmation','internal_new_application',
  'academy_application_accepted','academy_application_waitlisted',
  'academy_onboarding','academy_payment_confirmation',
  'academy_waitlist_seat_opened','masterclass_reminder_24h',
  'masterclass_followup','masterclass_reminder_30','masterclass_reminder_5',
  'masterclass_registration_confirmation'
]

# For practical purposes: the registry file contains the full HTML.
# We will extract the render HTML strings using regex and update DB.
extracted = {}
for key in keys:
    # Find block for this key: it appears as key followed by colon
    # We find the render method containing the key
    idx = content.find(f"'{key}':")
    if idx == -1:
        idx = content.find(f'"{key}":')
    if idx == -1:
        extracted[key] = "<!doctype html><html><body>Template " + key + " — source missing; import from registry required.</body></html>"
        continue
    # Find render method after this index
    render_start = content.find("render(", idx)
    if render_start == -1:
        extracted[key] = "<!doctype html><html><body>Template " + key + " — render missing.</body></html>"
        continue
    # Find return \`...\` within render method (next backtick block)
    backtick = content.find("`", render_start)
    if backtick == -1:
        extracted[key] = "<!doctype html><html><body>Template " + key + " — backtick missing.</body></html>"
        continue
    # Find closing backtick (next unescaped backtick)
    close = content.find("`", backtick + 1)
    if close == -1:
        close = content.find("`", close + 1)
    html = content[backtick+1:close]
    # Replace variables with actual values for DB import
    # Keep the template as-is (with variables like {{firstName}}) — that's correct
    extracted[key] = html[:5000]  # Truncate if very long for SQL safety
    
# Write updates
with open("update_real_templates.sql", "w") as f:
    f.write("BEGIN;\n")
    for key, html in extracted.items():
        # Escape single quotes for SQL
        safe = html.replace("'", "''")
        # Update status to draft, set html and text_content
        f.write(f"UPDATE email_templates SET html = '{safe[:3000]}', text_content = '{key} — real registry HTML', updated_at = now(), status = 'draft', version = 2 WHERE key = '{key}';\n")
    f.write("COMMIT;\n")

for k,v in extracted.items():
    print(k, "-> length", len(v), "chars, starts:", v[:60].replace(chr(10)," "))
print("Wrote update_real_templates.sql")
