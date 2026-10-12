with open('supabase/functions/paymongo-webhook/index.ts') as f:
    lines = f.read().splitlines(keepends=True)
for i in range(len(lines)):
    if '.replaceAll(\'"\',""' in lines[i]:
        print('line', i+1, ':', lines[i])
        # Fix by replacing the broken argument
        lines[i] = lines[i].replace('.replaceAll(\'"\',""', ".replaceAll('\"','&quot;")
        # Actually the line also needs to keep the final ); but the broken argument already includes the quote
        # Let's just build from scratch: find the broken snippet and replace exactly
        broken = '.replaceAll(\'"\',""');'
        fixed = '.replaceAll(\'"\',"&quot;");'
        if broken in lines[i]:
            lines[i] = lines[i].replace(broken, fixed)
            print('fixed line', i+1)
        else:
            print('broken snippet not found in line')
with open('supabase/functions/paymongo-webhook/index.ts', 'w') as f:
    f.writelines(lines)
