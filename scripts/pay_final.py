with open('supabase/functions/paymongo-webhook/index.ts') as f:
    lines = f.read().splitlines()
for i in range(len(lines)):
    if 'replaceAll' in lines[i] and '""' in lines[i]:
        # The broken part ends with '"',"");
        # Replace the last segment
        old = "replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('"','\"\"');"
        # Actually just split on the broken part
        lines[i] = lines[i].replace("replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('"','\"\"');",
                                   "replaceAll('&').replaceAll('<','<').replaceAll('>','>').replaceAll('"','\"&quot;\");")
        with open('supabase/functions/paymongo-webhook/index.ts','w') as f:
            f.write('\n'.join(lines)+'\n')
        print('paymongo fixed line', i+1)
        break
