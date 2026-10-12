with open('supabase/functions/_shared/email-template-registry.ts', encoding='utf-8') as f:
    content = f.read()
# Find object starting with academy_application_confirmation
match_start = content.find('key: "academy_application_confirmation"')
print('Start:', match_start)
snippet = content[match_start:match_start+3000]
# Find render method
render_idx = snippet.find('render(')
print('Render at offset:', render_idx)
if render_idx != -1:
    render_section = snippet[render_idx:render_idx+5000]
    # Find first backtick after render
    bt = render_section.find('`')
    print('Backtick at:', bt)
    if bt != -1:
        close = render_section.find('`', bt+1)
        html = render_section[bt+1:close]
        print('HTML length:', len(html))
        print(html[:800])
