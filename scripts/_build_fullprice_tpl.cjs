// Restore standard full-price academy_application_accepted (Group 1 template)
const KEY = "academy_application_accepted";
const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden">
<tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px"><img src="https://www.getassistara.com/assistara-logo.png" width="42" height="42" alt="Assistara" style="display:block;width:42px;height:42px;border:0"></td>
<td><b style="color:#fff;font-size:23px">Assistara</b></td>
</tr></table></td></tr>
<tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px;line-height:1.15">You&#8217;re IN! Welcome to Assistara Academy! &#127881;&#128155;</h1></td></tr>
<tr><td style="padding:0 32px 20px;font-size:16px;line-height:1.65;color:#4f4b45">
<p style="margin:0 0 16px">Hi {{first_name}},</p>
<p style="margin:0 0 16px">We&#8217;ve reviewed your application, and we have some exciting news...</p>
<p style="margin:0 0 16px"><strong>You&#8217;ve been ACCEPTED into Assistara Academy!</strong> &#127881;</p>
<p style="margin:0 0 16px">We&#8217;re so happy to welcome you to our very first generation of students!</p>
<p style="margin:0 0 16px">You took the first step by applying, and now we&#8217;re excited to help you take the next one: building real skills, gaining confidence, and working toward your first remote client.</p>
<h3 style="font-size:20px;margin:24px 0 12px;color:#151515">Your next step &#128640;</h3>
<p style="margin:0 0 16px">We&#8217;re keeping our first Academy batch small, with <strong>only {{limit}} spots available</strong>, so we can give our founding students the attention and support they deserve.</p>
<p style="margin:0">Your application has been approved, but your spot is only secured once you&#8217;ve completed enrollment.</p>
</td></tr>
<tr><td style="padding:8px 32px 12px"><a href="{{checkout_url}}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">SECURE MY ACADEMY SPOT &#8594;</a></td></tr>
<tr><td style="padding:0 32px 28px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="{{checkout_url}}" style="color:#4f4b45;word-break:break-all">{{checkout_url}}</a></td></tr>
<tr><td style="padding:0 32px 24px;font-size:16px;line-height:1.65;color:#4f4b45">
<p style="margin:0 0 16px">We can&#8217;t wait to welcome you inside, {{first_name}}!</p>
<p style="margin:0 0 16px">Here&#8217;s to new skills, new opportunities, and the beginning of something exciting. &#128155;</p>
<p style="margin:0 0 16px"><strong>Xyra &amp; the Assistara Team</strong></p>
<p style="margin:0;font-size:14px;color:#77716a"><em>P.S. Remember to enter your welcome code XYRA at checkout to receive your discount if you have a welcome offer.</em></p>
</td></tr>
<tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px;line-height:1.6">Assistara<br>www.getassistara.com</td></tr>
</table></td></tr></table>
</body></html>`;

const text = `You're IN! Welcome to Assistara Academy! \u{1F389}\u{1F49B}

Hi {{first_name}},

We've reviewed your application, and we have some exciting news...

You've been ACCEPTED into Assistara Academy! \u{1F389}

We're so happy to welcome you to our very first generation of students!

You took the first step by applying, and now we're excited to help you take the next one: building real skills, gaining confidence, and working toward your first remote client.

Your next step \u{1F680}

We're keeping our first Academy batch small, with only {{limit}} spots available, so we can give our founding students the attention and support they deserve.

Your application has been approved, but your spot is only secured once you've completed enrollment.

SECURE MY ACADEMY SPOT \u2192
{{checkout_url}}

We can't wait to welcome you inside, {{first_name}}!

Here's to new skills, new opportunities, and the beginning of something exciting. \u{1F49B}

Xyra & the Assistara Team

P.S. Remember that your enrollment is at the regular price of \u20B16,900 unless you have a welcome offer applied.`;

const vars = [
  { name: "first_name", label: "First name", description: "Applicant's first name", type: "string", required: true, sample: "Stephanie", dynamic: true },
  { name: "checkout_url", label: "Checkout link", description: "Personal enrollment checkout link", type: "url", required: true, sample: "https://www.getassistara.com/academy/checkout?token=sample", dynamic: true },
  { name: "limit", label: "Cohort limit", description: "Paid spots available", type: "number", required: true, sample: "15", dynamic: false },
  { name: "name", label: "Full name", description: "Applicant's full name", type: "string", required: false, sample: "Stephanie Adajar", dynamic: true },
];

console.log(JSON.stringify({ key: KEY, subject: "You're IN! Your Assistara Academy application is approved!", html, text, vars }));
