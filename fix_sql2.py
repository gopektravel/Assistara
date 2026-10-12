with open('import_active_drafts.sql', encoding='utf-8') as f:
    content = f.read()
# Strip text_content from column list and remove the value from VALUES for each row
# Replace the column declaration
content = content.replace(
    'email_templates (key, name, category, status, version, created_by, html, subject, preview_text, text_content, is_critical)',
    'email_templates (key, name, category, status, version, created_by, html, subject, preview_text, is_critical)'
)
# Remove the text_content value from each VALUES pattern (the value between the last quoted preview_text and false)
# The pattern: ...,'Your Academy application','Template ... content ...',false) -> ...,'Your Academy application',false)
import re
content = re.sub(
    r",'Template [^']+ content[^']* import draft\.',false\) ON CONFLICT",
    ",false) ON CONFLICT",
    content
)
with open('import_active_drafts.sql', 'w', encoding='utf-8') as f:
    f.write(content)
print('Stripped broken text_content from SQL; will rely on DB defaults.')
