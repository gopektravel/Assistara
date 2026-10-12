with open('supabase/functions/paymongo-webhook/index.ts', 'rb') as f:
    data = f.read()

# The broken sequence: b".replaceAll('\"',\"\");"
# We search by looking at the bytes around it.
search = b".replaceAll('\\\"',\\\"\\\"");"
print('search len', len(search))
print('search found?', search in data)
if search in data:
    data = data.replace(search, b".replaceAll('\\\"',\"&quot;\");")
    with open('supabase/functions/paymongo-webhook/index.ts', 'wb') as f:
        f.write(data)
    print('fixed paymongo via bytes')
else:
    # Try finding by scanning
    idx = data.find(b"replaceAll('")
    print('replaceAll found at', idx)
    print('snippet:', data[idx:idx+80])
