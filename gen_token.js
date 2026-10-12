const crypto = require('crypto');

const SERVICE_KEY = 'a8467dc43cda57fbb819e99f3ebf75b8ebf86ed8aa9c3db0d5d7230e9bf3f934';
const TOKEN_VERSION = '6a84cbdc28356082efe460d691493210cd6492fc278e08de24ebfe56dbeed485';
const exp = Math.floor(Date.now() + 3600000);

const payload = JSON.stringify({ v: TOKEN_VERSION, u: 'admin', exp });
const payloadB64 = Buffer.from(payload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const hmac = crypto.createHmac('sha256', SERVICE_KEY);
hmac.update(payloadB64);
const sigB64 = hmac.digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const token = payloadB64 + '.' + sigB64;
console.log('Token:', token);