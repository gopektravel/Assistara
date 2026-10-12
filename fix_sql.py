with open('import_active_drafts.sql', encoding='utf-8') as f:
    lines = f.read().split('\n')

new_lines = []
for line in lines:
    if 'VALUES' in line and 'ON CONFLICT' in line:
        # Extract the key from the line to build appropriate text_content
        key_start = line.find("VALUES ('")
        if key_start != -1:
            key_end = line.find("','", key_start)
            key = line[key_start+8:key_end]
        else:
            key = 'template'
        # Find ',false) ON CONFLICT' and replace with text_content value before false
        # The current format: ...,is_critical) VALUES (...,preview_text,false) ON CONFLICT
        # We need to insert text_content before false (before is_critical in the column list? No, the column list added text_content before is_critical)
        # Actually I just changed the column list but didn't add the value.
        # The line format: VALUES (...,preview_text,false)
        # Need: (..., preview_text, 'text_content_value', false)
        # Find the last value before false
        line = line.replace(",false) ON CONFLICT", f",'Template {key} content — import draft.',false) ON CONFLICT")
    new_lines.append(line)

with open('import_active_drafts.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))
print('Fixed SQL with text_content column.')
