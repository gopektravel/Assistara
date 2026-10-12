import os,re
base='assistara-local-v9'
# 1. Replace DM Sans links with Manrope in embedded tool standalone pages
for f in ['admin-acquisition.html','admin-finance.html','admin-email.html','admin-masterclass-event.html','admin-template-studio.html']:
    p=os.path.join(base,f)
    s=open(p,encoding='utf-8').read()
    # Replace Google Fonts link family
    s=s.replace('family=DM+Sans:wght@400;500;600;700&display=swap','family=Manrope:wght@400;500;600;700;800&display=swap')
    s=s.replace('family=DM+Sans:wght@400;500;700&display=swap','family=Manrope:wght@400;500;600;700;800&display=swap')
    s=s.replace('family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap','family=Manrope:wght@300;400;500;600;700;800&display=swap')
    # Replace inline font-family references
    s=s.replace('font-family:"DM Sans",sans-serif','font-family:"Manrope",sans-serif')
    s=s.replace("font-family:'DM Sans',sans-serif","font-family:'Manrope',sans-serif")
    # Restore manrope-lock link if it was removed (check for manrope-lock absence)
    if '<link rel="stylesheet" href="/manrope-lock.css' not in s:
        # Insert after first </style> or before </head>
        s=s.replace('</style></head>','</style><link rel="stylesheet" href="/manrope-lock.css?v=20260917-3" /></head>')
    open(p,'w',encoding='utf-8').write(s)
    print('updated font links', f, 'manrope-lock?', '/manrope-lock.css' in s)
# 2. Rename Masterclass Event -> Live Events in admin.html references
p=os.path.join(base,'admin.html')
s=open(p,encoding='utf-8').read()
# Only replace visible/user-facing labels, not data-tool attribute or API names unintentionally
replacements={
    'data-tooltip="Masterclass Event"':'data-tooltip="Live Events"',
    '<span class="nav-item-label">Masterclass Event</span>':'<span class="nav-item-label">Live Events</span>',
    'crumb: [["Marketing", "Masterclass Event"]]':'crumb: [["Marketing", "Live Events"]]',
    'title: "Masterclass Event"':'title: "Live Events"',
    '/* Finance / Acquisition Tracker / Masterclass Event are mounted here':'/* Finance / Acquisition Tracker / Live Events are mounted here',
    '* Finance, Acquisition Tracker and Masterclass Event already exist':'* Finance, Acquisition Tracker and Live Events already exist',
    '* (Finance / Acquisition / Masterclass Event)':'* (Finance / Acquisition / Live Events)',
}
for k,v in replacements.items():
    s=s.replace(k,v)
open(p,'w',encoding='utf-8').write(s)
print('admin.html renamed Live Events; count:', s.count('Live Events'))
# 3. Rename in masterclass standalone tool page title/headline
p=os.path.join(base,'admin-masterclass-event.html')
s=open(p,encoding='utf-8').read()
s=s.replace('<title>Masterclass Event | Assistara Admin</title>','<title>Live Events | Assistara Admin</title>')
s=s.replace('<h1>Masterclass Event</h1>','<h1>Live Events</h1>')
open(p,'w',encoding='utf-8').write(s)
print('masterclass-event.html renamed')
# 4. Inject :host .shell > .head hide into admin.html shared style or near mountTool
p=os.path.join(base,'admin.html')
s=open(p,encoding='utf-8').read()
# Insert a CSS rule into the existing <style> block that targets mounted tool heads
if ':host .shell > .head { display:none; }' not in s:
    s=s.replace('/* Shared brand tokens', '/* Hide embedded standalone page header inside mounted tools */\n      :host .shell > .head { display:none; }\n      /* Shared brand tokens')
open(p,'w',encoding='utf-8').write(s)
print('injected hidden .head rule')
