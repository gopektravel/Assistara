with open('supabase/functions/paymongo-webhook/index.ts', 'r') as f:
    s = f.read()
# Find the exact broken sequence (without quoting conflicts in Python source)
start = s.find("replaceAll('&')")  # Actually find by two parts
# Find the exact broken string by scanning
pos = s.find('.replaceAll(\'"\',')
print('pos=', pos)
if pos >= 0:
    # Extract from pos to see what's there
    snippet = s[pos:pos+60]
    print('snippet:', snippet)
    # The broken part is `.replaceAll('"',""` followed by `);`
    # Let's replace using the exact snippet we see
    broken = '.replaceAll(\'"\',"' + '"' + '");'
    # Wait, let's just split by double-quote pairs. Actually let's use a simple string that doesn't contain `""`
    # Search for the exact bytes
    import re
    # Replace `.replaceAll('"',""` with `.replaceAll('"',"&quot;`
    # And ensure the closing quote is preserved.
    fixed_snippet = s.replace('.replaceAll(\'"\',""');', '.replaceAll(\'"\',"&quot;");')
    # Also handle case where `);` might be missing the quote
    # Let's check if the replacement worked by checking the snippet
    s2 = s.replace('.replaceAll(\'"\',""');', '.replaceAll(\'"\',"&quot;");')
    if s2 != s:
        s = s2
        print('replaced')
    else:
        # Try different variation
        s2 = s.replace('.replaceAll(\'"\',""",', '.replaceAll(\'"\',"&quot;",')
        if s2 != s:
            s = s2
            print('replaced v2')
        else:
            print('no replacement made')
with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
    f.write(s)
