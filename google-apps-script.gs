const SPREADSHEET_ID = '1NbGww9BIN31eWBnfcQtlkuhQXTfy----31MpqB4OkUk';
const LEAD_SHEET = 'Sheet1';
const MASTERCLASS_SHEET = 'Masterclass Signups';
const ACADEMY_SHEET = 'Academy Applications';
const LEAD_NOTIFICATION_EMAIL = 'support@getassistara.com';

function doPost(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const p = (e && e.parameter) ? e.parameter : {};

  const first = (...keys) => {
    for (const key of keys) {
      if (p[key] !== undefined && String(p[key]).trim() !== '') return String(p[key]).trim();
    }
    return '';
  };

  const name = first('name', 'fullName', 'yourName');
  const email = first('email', 'workEmail');
  const company = first('company', 'brand', 'companyBrand');
  const delegating = first('delegating', 'tasks', 'bottleneck', 'timeStealers', 'whatKeepsStealingYourTime');
  const support = first('support', 'supportNeeded', 'hours') || 'Not sure yet';

  if (company === 'Assistara Academy — Founding Cohort Application') {
    const sheet = ss.getSheetByName(ACADEMY_SHEET);
    const value = (text, start, end) => {
      const re = end
        ? new RegExp(start + ':\\s*([\\s\\S]*?)(?:\\n\\n' + end + ':|$)')
        : new RegExp(start + ':\\s*([\\s\\S]*)');
      const m = String(text || '').match(re);
      return m ? m[1].trim() : '';
    };

    sheet.appendRow([
      new Date(),
      name,
      email,
      value(delegating, 'Current situation', 'Remote-work goal'),
      value(delegating, 'Remote-work goal', 'What they tried'),
      value(delegating, 'What they tried', 'Biggest obstacle'),
      value(delegating, 'Biggest obstacle', 'Interested direction'),
      value(delegating, 'Interested direction'),
      value(support, 'Weekly commitment', 'Payment readiness'),
      value(support, 'Payment readiness', 'Founding price shown'),
      'New',
      '',
      'Not paid',
      ''
    ]);

    MailApp.sendEmail({
      to: LEAD_NOTIFICATION_EMAIL,
      subject: 'New Assistara Academy application' + (name ? ' - ' + name : ''),
      htmlBody:
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717">' +
        '<h2 style="margin:0 0 18px">New Founding Cohort application</h2>' +
        '<p><strong>Name:</strong> ' + escapeHtml(name || 'Not provided') + '</p>' +
        '<p><strong>Email:</strong> ' + escapeHtml(email || 'Not provided') + '</p>' +
        '<p><strong>Payment readiness:</strong> ' + escapeHtml(value(support, 'Payment readiness', 'Founding price shown') || 'Not provided') + '</p>' +
        '<p style="margin-top:24px"><a href="https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit" style="display:inline-block;background:#ffd51f;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px">Open applications</a></p>' +
        '</div>',
      name: 'Assistara Academy'
    });

    return jsonOk('academy_application');
  }

  if (company === 'Academy Masterclass') {
    const sheet = ss.getSheetByName(MASTERCLASS_SHEET);
    sheet.appendRow([new Date(), name, email, delegating, 'New']);
    return jsonOk('masterclass_signup');
  }

  const sheet = ss.getSheetByName(LEAD_SHEET);
  sheet.appendRow([
    new Date(), name, email, company, delegating, support,
    'New', '', '', '', ''
  ]);

  MailApp.sendEmail({
    to: LEAD_NOTIFICATION_EMAIL,
    subject: 'New Assistara lead' + (name ? ' - ' + name : ''),
    htmlBody:
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717">' +
      '<h2 style="margin:0 0 18px">New Assistara lead</h2>' +
      '<p><strong>Name:</strong> ' + escapeHtml(name || 'Not provided') + '</p>' +
      '<p><strong>Email:</strong> ' + escapeHtml(email || 'Not provided') + '</p>' +
      '<p><strong>Company / brand:</strong> ' + escapeHtml(company || 'Not provided') + '</p>' +
      '<p><strong>What they want to delegate:</strong><br>' + escapeHtml(delegating || 'Not provided') + '</p>' +
      '<p><strong>Support needed:</strong> ' + escapeHtml(support) + '</p>' +
      '<p style="margin-top:24px"><a href="https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit" style="display:inline-block;background:#ffd51f;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px">Open lead sheet</a></p>' +
      '</div>',
    name: 'Assistara Website'
  });

  return jsonOk('website_lead');
}

function jsonOk(type) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, type: type }))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'Assistara leads' }))
    .setMimeType(ContentService.MimeType.JSON);
}
