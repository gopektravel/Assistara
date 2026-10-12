BEGIN;
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial;color:#151515"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">We got your application</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p>Hi there,</p><p>Thanks for applying to Assistara Academy! We''ve received your application and our team is reviewing it now.</p><p>We''ll email you as soon as we have an update — usually within a couple of days.</p><p>Warmly,<br><strong>The Assistara Team</strong></p></td></tr><tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px">Assistara<br>www.getassistara.com</td></tr></table></td></tr></table></body></html>', subject = 'Your Assistara Academy application ✨', text_content = 'Hi there,

Thanks for applying to Assistara Academy! We''ve received your application and our team is reviewing it now.

We''ll email you as soon as we have an update.

The Assistara Team — www.getassistara.com', status = 'draft', version = 2, updated_at = now() WHERE key = 'academy_application_confirmation';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">New Academy application</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p><strong>Name:</strong> </p><p><strong>Email:</strong> </p><p>Review it in the admin dashboard.</p></td></tr></table></td></tr></table></body></html>', subject = 'New Academy application: ', text_content = 'New Academy application

Name: 
Email: 

Review in the admin dashboard: ', status = 'draft', version = 2, updated_at = now() WHERE key = 'internal_new_application';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">You''re IN! Welcome to Assistara Academy!</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p>Hi there,</p><h2 style="font-size:22px;margin:20px 0 8px">You did it!</h2><p>We''ve reviewed your application, and we''re excited to offer you a place in the <strong>Assistara Academy Founding Cohort!</strong></p><p>You''re one step closer to building your skills, finding your first remote client, and creating new opportunities for yourself.</p><p><strong>Here''s the important part:</strong></p><div style="background:#fff9df;border:1px solid #e6c353;border-radius:12px;padding:18px;color:#151515"><strong>Only  paid spots available!</strong><br>Your application has been accepted, but your seat isn''t reserved just yet. Spots are confirmed once payment is completed.</div><p>Ready to make it official? Secure your place and let''s get started!</p><p>See you inside!<br><strong>The Assistara Team</strong></p></td></tr><tr><td style="padding:8px 32px 12px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">YES! Secure my spot</a></td></tr><tr><td style="padding:0 32px 32px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="" style="color:#4f4b45;word-break:break-all"></a></td></tr></table></td></tr></table></body></html>', subject = 'You''re IN! Welcome to Assistara Academy!', text_content = '', status = 'draft', version = 2, updated_at = now() WHERE key = 'academy_application_accepted';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">Not this round, but you''re on our list!</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p>Hi there,</p><p>We''ve got some news for you!</p><p>The response to Assistara Academy has been incredible, and unfortunately, we couldn''t offer you a spot in our first cohort.</p><p><strong>But fear not! You''re on our waitlist!</strong></p><p>That means you''ll be among the first to hear when spots open up or our next cohort launches.</p><p>Your journey toward landing your first remote client doesn''t stop here. We''re excited to hopefully have you join us next time!</p><p>Keep an eye on your inbox. We''ll be in touch!</p><p><strong>See you soon!</strong><br>The Assistara Team</p></td></tr></table></td></tr></table></body></html>', subject = 'Not this round, but you''re on our list!', text_content = '', status = 'draft', version = 2, updated_at = now() WHERE key = 'academy_application_waitlisted';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#151515"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 30px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px;color:#fff;font-size:21px;font-weight:700">Assistara Academy</td></tr></table></td></tr><tr><td style="padding:34px 30px 8px"><h1 style="margin:0;font-size:30px">Set up your Academy account</h1></td></tr><tr><td style="padding:12px 30px 24px;font-size:16px;line-height:1.6;color:#4f4b45"><p>Hi there,</p><p>Your payment is confirmed and your place in Assistara Academy is secured.</p><p>Use the button below to finish onboarding and create your Academy account.</p></td></tr><tr><td style="padding:0 30px 18px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:12px">Create my Academy account</a></td></tr><tr><td style="padding:0 30px 34px;color:#77716a;font-size:12px">If the button does not work, copy this link:<br><a href="" style="word-break:break-all"></a></td></tr></table></td></tr></table></body></html>', subject = 'Set up your Assistara Academy account', text_content = '', status = 'draft', version = 2, updated_at = now() WHERE key = 'academy_onboarding';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 30px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px;color:#fff;font-size:23px;font-weight:700">Assistara</td></tr></table></td></tr><tr><td style="padding:34px 30px 8px"><h1 style="margin:0;font-size:30px;line-height:1.15">Payment received 🎉</h1></td></tr><tr><td style="padding:12px 30px 24px;font-size:16px;line-height:1.6;color:#4f4b45"><p>Hi there,</p><p>We received your payment and your place in Assistara Academy is secured. 🎉</p><table width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;background:#faf9f5;border-radius:14px"><tr><td style="padding:16px 18px"><strong>Purchase</strong><br>Assistara Academy - Founding Cohort</td><td align="right" style="padding:16px 18px"><strong>₱0</strong></td></tr><tr><td style="padding:0 18px 12px;color:#777">Receipt</td><td align="right" style="padding:0 18px 12px"></td></tr><tr><td style="padding:0 18px 12px;color:#777">Payment method</td><td align="right" style="padding:0 18px 12px"></td></tr><tr><td style="padding:0 18px 16px;color:#777">Status</td><td align="right" style="padding:0 18px 16px"><strong>PAID</strong></td></tr></table><p>Your branded payment receipt is attached as a PDF for your records.</p><p>Your next step is to set up your Academy account.</p></td></tr><tr><td style="padding:0 30px 18px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">Set up my Academy account</a></td></tr><tr><td style="padding:0 30px 34px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="" style="color:#4f4b45;word-break:break-all"></a></td></tr></table></td></tr></table></body></html>', subject = 'Payment received 🎉  | Assistara Academy', text_content = '', status = 'draft', version = 2, updated_at = now() WHERE key = 'academy_payment_confirmation';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px">A seat just opened in the Academy cohort 🎉</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p>Hi there,</p><p>Good news — a spot just opened up in the Assistara Academy founding cohort, and you''re next on the priority waitlist.</p><p>Your invite is time-sensitive: seats are confirmed in payment order.</p><p><strong>This link is private — please don''t share it.</strong></p></td></tr><tr><td style="padding:8px 32px 12px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">Secure my spot →</a></td></tr><tr><td style="padding:0 32px 32px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="" style="color:#4f4b45;word-break:break-all"></a></td></tr></table></td></tr></table></body></html>', subject = 'A seat just opened in the Academy cohort 🎉', text_content = '', status = 'draft', version = 2, updated_at = now() WHERE key = 'academy_waitlist_seat_opened';
UPDATE email_templates SET html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your free masterclass reminder</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="left" style="padding:32px 20px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="font-family:Arial,Helvetica,sans-serif;color:#232323;font-size:16px;line-height:1.62">
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Hey there! 💛</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Okay, I have to admit... I&#8217;ve been looking forward to <b>tomorrow</b> all week! ✨</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">I&#8217;m Xyra, co-founder of Assistara, and  I&#8217;ll be going live with the free masterclass you signed up for:</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323"><b>How to Land Your First Remote Client (as a Complete Beginner)</b></p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">And don&#8217;t worry, I&#8217;m not going to tell you to just &#8220;learn some skills&#8221; and send 100 job applications. 😅</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">I&#8217;ve worked remotely with <b>multiple international clients</b>, earned in foreign currencies, and experienced firsthand what it&#8217;s like to build opportunities beyond the traditional 9-to-5.</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">I&#8217;ve seen what clients actually look for, what makes them trust someone enough to hire them, and why so many beginners struggle to get noticed.</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">And if there&#8217;s one thing that experience has taught me, it&#8217;s this:</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323"><b>Making money online doesn&#8217;t have to be as complicated as people make it seem.</b> 💛</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">You don&#8217;t need to have everything figured out. You need to know what services people are willing to pay for, where to find the right clients, and how to give them a reason to choose you.</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">That&#8217;s exactly what I want to show you .</p>
    <p style="margin:0 0 20px;line-height:1.7;font-size:16px;color:#232323">
      📅 <b></b><br>
      ⏰ <b> Philippine Time</b><br>
      📍 <b>Live on Assistara</b>
    </p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Here&#8217;s your personal link to join us live:</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323"><a href="" style="color:#1155cc;text-decoration:underline;word-break:break-all"></a></p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Save this email so you can easily find your link when it&#8217;s time to join! 💛</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323"><a href="" style="color:#1155cc;text-decoration:underline">📅 Add to Calendar</a></p>
    <p style="margin:-8px 0 18px;line-height:1.5;font-size:13px;color:#8a8a8a">On Apple or Outlook? <a href="" style="color:#8a8a8a;text-decoration:underline">Download the calendar file (.ics)</a></p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Grab your favorite drink, bring your questions, and come with an open mind. I have so much I want to share with you! ☀️</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Can&#8217;t wait to see you there! 💛</p>
    <p style="margin:26px 0 30px;line-height:1.55;font-size:16px;color:#232323"><b>Xyra Mendoza</b><br><span style="color:#6b6b6b">Co-founder, Assistara</span></p>
    <p style="margin:0;line-height:1.6;font-size:12px;color:#8a8a8a">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>', subject = 'there, your Assistara masterclass is  — here''s your join link', text_content = 'Hey there! 💛

Okay, I have to admit... I''ve been looking forward to tomorrow all week! ✨

I''m Xyra, co-founder of Assistara, and  I''ll be going live with the free masterclass you signed up for:

How to Land Your First Remote Client (as a Complete Beginner)

📅 
⏰  Philippine Time
📍 Live on Assistara

Here''s your personal link to join us live:


Save this email so you can easily find your link when it''s time to join! 💛

Add to Calendar: 
Apple / Outlook (.ics): 

Can''t wait to see you there!', status = 'draft', version = 2, updated_at = now() WHERE key = 'masterclass_reminder_24h';
UPDATE email_templates SET html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oops, one more thing</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="left" style="padding:32px 20px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="font-family:Arial,Helvetica,sans-serif;color:#232323;font-size:16px;line-height:1.62">
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Hey there! 💛</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">Oops! 😅 The P.S. from my last email got cut off, and I didn&#8217;t want you to miss it!</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323"><b>P.S.</b> We&#8217;ve already received <b> applications for our  Academy spots!</b> 💛</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">We review applications in the order they come in, so I wanted to make sure you had the chance to apply before tomorrow&#8217;s masterclass!</p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">👉 <a href="https://www.getassistara.com/academy/apply" style="color:#1155cc;text-decoration:underline">https://www.getassistara.com/academy/apply</a></p>
    <p style="margin:0 0 18px;line-height:1.62;font-size:16px;color:#232323">See you tomorrow!</p>
    <p style="margin:26px 0 30px;line-height:1.55;font-size:16px;color:#232323">Xyra 💛</p>
    <p style="margin:0;line-height:1.6;font-size:12px;color:#8a8a8a">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>', subject = 'Oops, one more thing! 💛', text_content = 'Hey there! 💛

Oops! 😅 The P.S. from my last email got cut off, and I didn''t want you to miss it!

P.S. We''ve already received  applications for our  Academy spots! 💛

We review applications in the order they come in, so I wanted to make sure you had the chance to apply before tomorrow''s masterclass!

👉 https://www.getassistara.com/academy/apply

See you tomorrow!

Xyra 💛

You''re receiving this because you registered for the Assistara free masterclass.
Unsubscribe: ', status = 'draft', version = 2, updated_at = now() WHERE key = 'masterclass_followup';
UPDATE email_templates SET html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden">
<tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px"><img src="https://www.getassistara.com/assistara-logo.png" width="42" height="42" alt="Assistara" style="display:block;width:42px;height:42px;border:0;outline:none;text-decoration:none"></td>
<td><b style="color:#fff;font-size:23px">Assistara</b></td>
</tr></table></td></tr>

<tr><td style="padding:30px 32px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#171717;border-radius:18px"><tr><td align="center" style="padding:22px 18px">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:44px;font-weight:900;line-height:1;color:#ffd51f;letter-spacing:-.02em">30</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:.14em;color:#ffffff;margin-top:8px">MINUTES TO GO</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#b9b3a8;margin-top:8px">Sunday, October 11 · 6:00 PM PHT</div>
</td></tr></table></td></tr>
<tr><td style="padding:34px 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p style="margin:0 0 16px">Hey there! 💛</p><p style="margin:0 0 16px">It&#8217;s almost time!! 😍</p><p style="margin:0 0 16px">We&#8217;re going live in <b>30 minutes</b>, and I can&#8217;t wait to see you there!</p><p style="margin:0">Here&#8217;s your personal link:</p></td></tr>
<tr><td style="padding:8px 32px 12px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">JOIN THE MASTERCLASS</a></td></tr><tr><td style="padding:0 32px 28px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="" style="color:#4f4b45;word-break:break-all"></a></td></tr>
<tr><td style="padding:0 32px 24px;font-size:16px;line-height:1.65;color:#4f4b45"><p style="margin:0 0 16px">Grab a coffee, get comfy, and I&#8217;ll see you soon! ☕✨</p><p style="margin:0">The Assistara Team 💛</p></td></tr>
<tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px;line-height:1.6">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="" style="color:#77716a;text-decoration:underline">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>', subject = 'We''re going live in 30 minutes! 💛', text_content = 'Hey there! 💛

It''s almost time!! 😍

We''re going live in 30 minutes, and I can''t wait to see you there!

Here''s your personal link:

JOIN THE MASTERCLASS: 

Grab a coffee, get comfy, and I''ll see you soon! ☕✨

The Assistara Team 💛

Assistara — www.getassistara.com

You''re receiving this because you registered for the Assistara free masterclass.

Unsubscribe: ', status = 'draft', version = 2, updated_at = now() WHERE key = 'masterclass_reminder_30';
UPDATE email_templates SET html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden">
<tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px"><img src="https://www.getassistara.com/assistara-logo.png" width="42" height="42" alt="Assistara" style="display:block;width:42px;height:42px;border:0;outline:none;text-decoration:none"></td>
<td><b style="color:#fff;font-size:23px">Assistara</b></td>
</tr></table></td></tr>


<tr><td style="padding:34px 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45"><p style="margin:0 0 16px">Hey there!</p><p style="margin:0 0 16px">We&#8217;re live! Where are youuu? 👀</p><p style="margin:0">Come join us, we&#8217;re waiting for you!</p></td></tr>
<tr><td style="padding:8px 32px 12px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">JOIN US LIVE</a></td></tr><tr><td style="padding:0 32px 28px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="" style="color:#4f4b45;word-break:break-all"></a></td></tr>
<tr><td style="padding:0 32px 24px;font-size:16px;line-height:1.65;color:#4f4b45"><p style="margin:0">The Assistara Team 💛</p></td></tr>
<tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px;line-height:1.6">You&#8217;re receiving this because you registered for the Assistara free masterclass.<br><a href="" style="color:#77716a;text-decoration:underline">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>', subject = 'We''re live! Where are you? 👀', text_content = 'Hey there!

We''re live! Where are youuu? 👀

Come join us, we''re waiting for you!

JOIN US LIVE: 

The Assistara Team 💛

Assistara — www.getassistara.com

You''re receiving this because you registered for the Assistara free masterclass.

Unsubscribe: ', status = 'draft', version = 2, updated_at = now() WHERE key = 'masterclass_reminder_5';
UPDATE email_templates SET html = '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial;color:#151515"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px"><p>Hey there,</p><p>Your spot is officially saved for:</p><h2 style="margin:20px 0 8px;color:#151515;font-size:24px;line-height:1.2">How to Land Your First Remote Client</h2><div style="margin:18px 0 22px;padding:20px 22px;background:#fff8d6;border:1px solid #f1df86;border-radius:16px"><div style="font-size:20px;line-height:1.4;font-weight:800;color:#151515">📅 Sunday, October 11</div><div style="margin-top:4px;font-size:16px;font-weight:700;color:#4f4b45">6:00 PM PHT · Live Online</div></div><p>We''re going to show you the practical path from <strong>complete beginner → finding international clients → landing your first remote client.</strong></p><p><strong>Come ready to take notes. 🚀💛</strong></p><div style="margin:26px 0 8px"><a href="" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:800;padding:15px 21px;border-radius:999px">Join the masterclass →</a></div><p style="margin:10px 0 20px;font-size:13px;color:#77716a;line-height:1.55">Your personal masterclass link:<br><a href="" style="color:#151515;font-weight:700;word-break:break-all"></a></p></h1></td></tr><tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45">undefined</td></tr><tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px">Assistara<br>www.getassistara.com</td></tr></table></td></tr></table></body></html>', subject = 'You''re in 🎉 See you Sunday', text_content = 'You''re in 🎉

Hey there,

Your spot is officially saved for: How to Land Your First Remote Client

📅 Sunday, October 11
6:00 PM PHT · Live Online

Join the masterclass: ', status = 'draft', version = 2, updated_at = now() WHERE key = 'masterclass_registration_confirmation';
COMMIT;
