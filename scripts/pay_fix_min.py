with open('supabase/functions/paymongo-webhook/index.ts') as f: s=f.read()
start = s.find("text:`Payment received")
if start>=0:
    # Just replace with simple text property that doesn't concatenate
    s = s.replace("text:`Payment received\\n\\nHi "+(app.name||'there').split(/\\s+/)[0]+',\\n\\nWe received your payment and your place in Assistara Academy is secured.\\n\\nReceipt: '+receipt+'\\n\\nYour next step is to set up your Academy account.\\n\\n'+url,", "text:'Payment received. See receipt at ' + url,")
with open('supabase/functions/paymongo-webhook/index.ts','w') as f: f.write(s)
print('paymongo fixed')
