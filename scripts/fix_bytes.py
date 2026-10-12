with open('supabase/functions/paymongo-webhook/index.ts', 'rb') as f:
    d = f.read()
start = d.find(b".replaceAll('")
end = d.find(b");", start)
seg = d[start:end+2]
print('segment bytes:', seg)
# Build new segment carefully: .replaceAll('"','&quot;');
new_bytes = b".replaceAll('\"',\"&quot;\");"
print('new bytes:', new_bytes)
d = d.replace(seg, new_bytes)
with open('supabase/functions/paymongo-webhook/index.ts', 'wb') as f:
    f.write(d)
print('done')
