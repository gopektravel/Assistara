with open('supabase/functions/paymongo-webhook/index.ts') as f:
    lines = f.read().splitlines()
# Line 15 (index 14) is the esc line
line = lines[14]
# Replace the broken end with correct escape using split/replace on exact substrings
# The broken ending is: replaceAll('"',"");
# We want: replaceAll('"',"&quot;");
broken_ending = "replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('"','\"\"');"
# Actually just find and replace the very last part of the line
last_part = "replaceAll('" , '\"\"');"
# Wait — let's split by single quote around double quote
parts = line.split("replaceAll('")
if len(parts) >= 2:
    # The last segment contains the double quote replacement
    # Just rebuild line with correct last segment
    line = line.replace('replaceAll(\'"\',\"\"\');', 'replaceAll(\'"\',\"&quot;\");')
    lines[14] = line
    with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('paymongo line 15 fixed')
else:
    print('split failed; line=', line[:80])
