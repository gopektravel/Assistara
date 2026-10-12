with open('supabase/functions/paymongo-webhook/index.ts') as f:
    s = f.read()
# Find the exact broken text segment and replace with a clean one-liner
start = s.find("text:'Payment received")
end = s.find(",senderName:", start)
if start >= 0 and end > start:
    s = s[:start] + "text:'Payment received. Receipt: ' + receipt + '. See policy at ' + url," + s[end:]
    with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
        f.write(s)
    print('paymongo text simplified')
else:
    print('paymongo not found', start, end)
