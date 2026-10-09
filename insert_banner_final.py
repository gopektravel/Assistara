content = open('assistara-local-v9/academy-apply.html', encoding='utf-8').read()
banner_text = 'Oops, our first cohort is full!'
if banner_text not in content:
    insert_point = content.find('<div class="form-card"')
    if insert_point == -1:
        insert_point = content.find('class="form-card"')
    banner = '<section id="soldoutSection" style="display:none;" class="shell"><div style="background:#fff;border:1px solid #dfdcd5;border-radius:30px;padding:48px 34px;box-shadow:0 24px 70px rgba(0,0,0,.08);text-align:center;max-width:700px;margin:auto;"><h2 style="font-family:Manrope,sans-serif;font-weight:800;font-size:clamp(32px,5vw,48px);letter-spacing:-.055em;margin:0 0 18px;color:#151515;">Oops, our first cohort is full! 🎉</h2><p style="font-family:Manrope,sans-serif;font-size:18px;line-height:1.6;color:#6a655e;margin:0 0 14px;max-width:640px;margin-left:auto;margin-right:auto;">All 15 spots for Assistara Academy\'s first cohort have been taken.</p><p style="font-family:Manrope,sans-serif;font-size:18px;line-height:1.6;color:#6a655e;margin:0 0 28px;max-width:640px;margin-left:auto;margin-right:auto;">We\'d still love to have you! Join our priority waitlist and we\'ll let you know as soon as another spot becomes available.</p><a href="#waitlistForm" style="display:inline-block;padding:15px 28px;font-family:Manrope,sans-serif;font-weight:800;font-size:16px;background:#171717;color:#fff;text-decoration:none;border-radius:14px;box-shadow:0 6px 20px rgba(23,23,23,.18);">Join the Priority Waitlist</a><p style="font-family:Manrope,sans-serif;font-size:13px;color:#9a948c;margin-top:14px;">Free to join. No payment required.</p></div></section>'
    content = content[:insert_point] + banner + content[insert_point:]
    open('assistara-local-v9/academy-apply.html','w',encoding='utf-8').write(content)
    print('Inserted banner at', insert_point)
else:
    print('Banner already present')
