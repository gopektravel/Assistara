const SPREADSHEET_ID = '1NbGww9BIN31eWBnfcQtlkuhQXTfy----31MpqB4OkUk';
const SHEET_NAME = 'Sheet1';

function doPost(e) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const p = (e && e.parameter) ? e.parameter : {};

  const first = (...keys) => {
    for (const key of keys) {
      if (p[key] !== undefined && String(p[key]).trim() !== '') return String(p[key]).trim();
    }
    return '';
  };

  sheet.appendRow([
    new Date(),
    first('name', 'fullName', 'yourName'),
    first('email', 'workEmail'),
    first('company', 'brand', 'companyBrand'),
    first('delegating', 'tasks', 'bottleneck', 'timeStealers', 'whatKeepsStealingYourTime'),
    first('support', 'supportNeeded', 'hours'),
    'New',
    '',
    '',
    '',
    ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'Assistara leads' }))
    .setMimeType(ContentService.MimeType.JSON);
}
