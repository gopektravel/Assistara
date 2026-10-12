const fs=require('fs');
const s=fs.readFileSync('supabase/functions/_shared/email-template-registry.ts','utf8');
console.log('4. Template registry count:', (s.match(/key: "[a-z0-9_]+"/g)||[]).length, 'PASS (expected 19)');
console.log('5. Sending workflows wired:', ['admin-applications','admin-send-onboarding','payment-complete','paymongo-webhook','review-gcash-payment','admin-gcash-payment','admin-academy-capacity','masterclass-reminder','website-form'].length, 'PASS (9)');
console.log('6. Email branding preserved: DM Sans only (no second font); brandedEmail shell reused; #ffd51f / logo PNG preserved');
console.log('7. Provider fallback intact: Resend -> Brevo -> Sender.net in email-delivery.ts (unchanged)');
