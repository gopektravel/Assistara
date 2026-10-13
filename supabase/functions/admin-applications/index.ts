import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailDelivery } from "../_shared/email-delivery.ts";
import { resolveEmailTemplate } from "../_shared/email-templates.ts";
import { academyEnrollmentApologyTemplate } from "../_shared/academy-enrollment-apology-template.ts";
import { createReplacementEnrollmentToken } from "../_shared/enrollment-token.ts";

const U = Deno.env.get("SUPABASE_URL")!, K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, R = Deno.env.get("RESEND_API_KEY") || "", SITE = "https://www.getassistara.com", USER = "admin", LIMIT = 15, enc = new TextEncoder();
const ENROLLMENT_FIX_CAMPAIGN = "academy_enrollment_link_fixed_20261012";
const ENROLLMENT_FIX_CUTOFF = "2026-10-12T07:40:44.780Z";
const allowed = new Set(["https://getassistara.com", "https://www.getassistara.com", "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
const ok = (o: string | null) => !!o && (allowed.has(o) || o.endsWith(".vercel.app"));
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function sign(p: string) { const k = await crypto.subtle.importKey('raw', enc.encode(K), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(p)))); }
async function auth(t: string) { try { const [p, s] = t.split('.'); if (!p || !s || await sign(p) !== s) return false; const raw = atob(p.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - p.length % 4) % 4)); const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)))); return !!d.v && d.v === (Deno.env.get("ADMIN_TOKEN_VERSION") || "") && d.u === USER && Date.now() < d.exp } catch { return false } }
const esc = (s: any) => String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function shell(title: string, body: string, cta?: { label: string, href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td><td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td></tr></table></td></tr><tr><td style="padding:34px 32px 8px"><h1>${title}</h1></td></tr><tr><td style="padding:12px 32px 26px;font-size:16px;line-height:1.65">${body}</td></tr>${cta ? `<tr><td style="padding:0 32px 32px"><a href="${cta.href}" target="_blank" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:12px">${cta.label}</a><p style="margin:18px 0 6px;color:#77716a;font-size:12px;line-height:1.5">Button not working? Copy and paste this link into your browser:</p><a href="${cta.href}" target="_blank" style="color:#5b574f;font-size:12px;line-height:1.5;word-break:break-all">${cta.href}</a><p style="font-size:12px;line-height:1.5;color:#77716a;margin:26px 0 0">A quick note: We may accept more applicants than the ${LIMIT} available spots. Acceptance does not guarantee a seat. Only the first ${LIMIT} accepted applicants to complete payment will secure their place in this cohort.</p></td></tr>` : ''}</table></td></tr></table></body></html>`;
}

async function log(db: any, type: string, id: string | null, action: string, details: any = {}) {
  await db.from('admin_activity_log').insert({ entity_type: type, entity_id: id, action, details });
}

async function affectedEnrollmentRecipients(db: any) {
  const { data: deliveries, error: deliveryError } = await db
    .from('email_delivery_log')
    .select('recipient_id,sent_at,status')
    .eq('email_type', 'academy_acceptance')
    .in('status', ['sent', 'delivered'])
    .lte('sent_at', ENROLLMENT_FIX_CUTOFF)
    .not('recipient_id', 'is', null);
  if (deliveryError) throw deliveryError;
  const ids = [...new Set((deliveries || []).map((row: any) => String(row.recipient_id || '')).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return [];
  const { data: apps, error: appError } = await db
    .from('academy_applications')
    .select('id,name,email,decision,status,payment_status,promo_code,checkout_amount_php,enrollment_token')
    .in('id', ids);
  if (appError) throw appError;
  return (apps || [])
    .filter((app: any) => app.payment_status !== 'paid' && (app.decision === 'accepted' || app.status === 'accepted'))
    .sort((left: any, right: any) => String(left.name || '').localeCompare(String(right.name || '')));
}

async function enrollmentApologyTemplate(app: any) {
  const first = String(app.name || 'there').trim().split(/\s+/)[0] || 'there';
  const replacementToken = await createReplacementEnrollmentToken(app.id);
  const url = `${SITE}/academy/checkout?token=${encodeURIComponent(replacementToken)}`;
  const tpl = await resolveEmailTemplate('academy_enrollment_link_fixed', {
    first_name: first,
    new_enrollment_link: url,
  }, () => academyEnrollmentApologyTemplate(first, url));
  return { first, url, tpl };
}

async function send(to: string, subject: string, html: string, text?: string, toName?: string, recipientId?: string) {
  const delivery = await createEmailDelivery('admin-applications');
  const idempotencyKey = `admin-app-${to.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}`;
  try {
    const result = await delivery.send({
      idempotencyKey,
      emailType: 'academy_acceptance',
      to, toName, subject,
      html, text,
      replyTo: 'academy@getassistara.com',
      campaignKey: 'academy_decisions',
      recipientId,
    } as import("../_shared/email-delivery.ts").EmailDeliveryOptions);
    return result.success;
  } catch (e) {
    console.error('admin-app-email-failed', e);
    return false;
  }
}

Deno.serve(async req => {
  const o = req.headers.get('origin'), h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ok(o) ? o! : SITE, 'Access-Control-Allow-Headers': 'content-type,authorization,x-enrollment-apology-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const out = (x: any, s = 200) => new Response(JSON.stringify(x), { status: s, headers: h });
  if (req.method !== 'POST' || (o && !ok(o))) return out({ ok: false, error: 'Forbidden' }, 403);
  let b: any = {}; try { b = await req.json() } catch { }
  const a = String(b.action || '');
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const campaignSecret = Deno.env.get('ENROLLMENT_APOLOGY_SEND_KEY') || '';
  const campaignAuthorized = a === 'send_enrollment_apology' && campaignSecret.length >= 32 && req.headers.get('x-enrollment-apology-key') === campaignSecret;
  if (!campaignAuthorized && !await auth(t)) return out({ ok: false, error: 'Session expired' }, 401);
  const db = createClient(U, K, { auth: { persistSession: false } });

  if (a === 'list') {
    const [A, W, B, L, KL] = await Promise.all([
      db.from('academy_applications').select('*').order('created_at', { ascending: false }).limit(500),
      db.from('masterclass_signups').select('*').order('created_at', { ascending: false }).limit(1000),
      db.from('b2b_leads').select('*').order('created_at', { ascending: false }).limit(1000),
      db.from('admin_activity_log').select('*').order('created_at', { ascending: false }).limit(1000),
      db.from('acquisition_links').select('id,token,channel,placement,label,destination,is_active')
    ]);
    if (A.error) return out({ ok: false, error: 'Applications: ' + A.error.message }, 500);
    if (W.error) return out({ ok: false, error: 'Webinar: ' + W.error.message }, 500);
    if (B.error) return out({ ok: false, error: 'B2B: ' + B.error.message }, 500);
    const x = A.data || [];
    const isEnrolled = (z: any) => z.status === 'onboarded' && z.payment_status === 'paid' && !!z.onboarding_completed_at && !!z.auth_user_id && !z.suspended_at;
    // Acceptance invitation outcome, derived from the provider email telemetry
    // (email_delivery_log + email_events) -- the only measured source of truth.
    // A missing signal is never reported as a failure; it is 'unresolved'.
    const inviteTypes = ['academy_acceptance', 'academy_enrollment_link_fixed'];
    const inviteEmails = [...new Set(x.flatMap((z: any) => {
      const e = String((z && z.email) || '').trim();
      return e ? [e, e.toLowerCase()] : [];
    }))];
    const inviteByEmail = new Map<string, any>();
    if (inviteEmails.length) {
      const inv = await db.from('email_delivery_log')
        .select('recipient_email,email_type,campaign_key,provider,provider_message_id,status,created_at,sent_at,delivered_at,bounced_at')
        .in('recipient_email', inviteEmails)
        .in('email_type', inviteTypes)
        .order('created_at', { ascending: false });
      const invRows = inv.error ? [] : (inv.data || []);
      const invIds = [...new Set(invRows.map((r: any) => String((r && r.provider_message_id) || '')).filter(Boolean))];
      const invEvents = invIds.length
        ? await db.from('email_events').select('provider_message_id,event_type').in('provider_message_id', invIds)
        : ({ data: [] } as any);
      const eventsByMessage = new Map<string, Set<string>>();
      for (const e of (invEvents && !invEvents.error ? invEvents.data || [] : [])) {
        const k = String((e && e.provider_message_id) || '');
        if (!k) continue;
        if (!eventsByMessage.has(k)) eventsByMessage.set(k, new Set<string>());
        eventsByMessage.get(k)!.add(String((e && e.event_type) || ''));
      }
      for (const r of invRows) {
        const k = String((r && r.recipient_email) || '').trim().toLowerCase();
        if (!k) continue;
        const types = eventsByMessage.get(String((r && r.provider_message_id) || '')) || new Set<string>();
        const info = inviteByEmail.get(k) || { recorded: true, delivered: false, bounced: false, failed: false, deferred: false, provider: null, provider_message_id: null, status: null, email_type: null, campaign_key: null, sent_at: null, delivered_at: null, bounced_at: null };
        if (r.delivered_at || types.has('delivered')) info.delivered = true;
        if (r.bounced_at || types.has('bounced')) info.bounced = true;
        if (String(r.status) === 'failed' || types.has('failed')) info.failed = true;
        if (types.has('deferred')) info.deferred = true;
        if (info.provider_message_id === null) {
          info.provider = r.provider || null;
          info.provider_message_id = r.provider_message_id || null;
          info.status = r.status || null;
          info.email_type = r.email_type || null;
          info.campaign_key = r.campaign_key || null;
          info.sent_at = r.sent_at || null;
          info.delivered_at = r.delivered_at || null;
          info.bounced_at = r.bounced_at || null;
        }
        inviteByEmail.set(k, info);
      }
    }
    const inviteOutcome = (z: any) => {
      const info = inviteByEmail.get(String((z && z.email) || '').trim().toLowerCase());
      if (!info) return { recorded: false, state: 'not_issued', verified: false };
      const state = info.delivered ? 'delivered'
        : info.bounced ? 'bounced'
        : info.failed ? 'failed'
        : info.deferred ? 'deferred'
        : 'unresolved';
      return {
        recorded: true,
        state,
        verified: state === 'delivered' || state === 'bounced' || state === 'failed',
        provider: info.provider,
        provider_message_id: info.provider_message_id,
        status: info.status,
        email_type: info.email_type,
        campaign_key: info.campaign_key,
        sent_at: info.sent_at,
        delivered_at: info.delivered_at,
        bounced_at: info.bounced_at,
      };
    };
    // Decorate every record with its acceptance-invitation outcome (the same
    // rows feed both the applications list and the enrolled-students list).
    x.forEach((z: any) => { z.acceptance_email = inviteOutcome(z); });
    const applicants = x.filter((z: any) => !isEnrolled(z));
    const students = x.filter(isEnrolled);
    const visitIds = [...new Set([...x, ...(W.data || [])].map((r: any) => String(r && r.acquisition_visit_id || '')).filter(Boolean))];
    const visitorIds = [...new Set([...x, ...(W.data || [])].map((r: any) => String(r && r.acquisition_visitor_id || '')).filter(Boolean))];
    const VSEL = 'id,acquisition_link_id,tracking_token,visitor_id,created_at,referrer,landing_path';
    const [VS1, VS2] = await Promise.all([
      visitIds.length ? db.from('acquisition_visits').select(VSEL).in('id', visitIds) : Promise.resolve({ data: [], error: null }),
      visitorIds.length ? db.from('acquisition_visits').select(VSEL).in('visitor_id', visitorIds).limit(5000) : Promise.resolve({ data: [], error: null })
    ]);
    const vmap = new Map();
    for (const row of [...(VS1.data || []), ...(VS2.data || [])]) if (row && row.id) vmap.set(row.id, row);
    const VS = { data: [...vmap.values()], error: null };
    const paidCount = x.filter((z: any) => z.payment_status === 'paid').length;
    let cap: any = null;
    try { const { data: ov } = await db.rpc('academy_capacity_overview'); if (ov?.ok) cap = ov } catch { }
    return out({ ok: true, applications: applicants, students, signups: W.data || [], b2b: B.data || [], activity: L.error ? [] : L.data || [], links: KL.error ? [] : KL.data || [], visits: VS.error ? [] : VS.data || [], capacity: { limit: cap?.capacity ?? LIMIT, paid: cap?.paid ?? paidCount, spots_left: cap != null ? cap.available : Math.max(0, LIMIT - paidCount), reservations: cap?.reservations ?? 0, stale_pending: cap?.stale_pending ?? 0, waitlist_waiting: cap?.waitlist_waiting ?? 0, waitlist_invited: cap?.waitlist_invited ?? 0, exceptions_open: cap?.exceptions_open ?? 0, cohort_name: cap?.cohort_name || 'Founding Cohort', is_open: cap?.is_open ?? true } });
  }

  if (a === 'audit_enrollment_apology' || a === 'preview_enrollment_apology') {
    try {
      const recipients = await affectedEnrollmentRecipients(db);
      const summary = recipients.map((app: any) => ({
        application_id: app.id,
        name: app.name,
        email: String(app.email || '').replace(/^(.).*(@.*)$/, '$1***$2'),
        amount_php: Number(app.checkout_amount_php) > 0 ? Number(app.checkout_amount_php) : 6900,
        promo_code: app.promo_code || null,
      }));
      if (a === 'audit_enrollment_apology') return out({ ok: true, campaign: ENROLLMENT_FIX_CAMPAIGN, count: summary.length, recipients: summary });
      if (!recipients.length) return out({ ok: false, error: 'No eligible affected recipients' }, 404);
      const rendered = await enrollmentApologyTemplate(recipients[0]);
      return out({
        ok: true,
        campaign: ENROLLMENT_FIX_CAMPAIGN,
        count: summary.length,
        recipient: summary[0],
        subject: rendered.tpl.subject,
        html: rendered.tpl.html,
        text: rendered.tpl.text,
        template_key: rendered.tpl.key,
        template_version: rendered.tpl.version,
        template_source: rendered.tpl.source,
      });
    } catch (error) {
      console.error('enrollment_apology_audit_failed', error instanceof Error ? error.message : 'unknown');
      return out({ ok: false, error: 'Could not audit affected enrollment recipients' }, 500);
    }
  }

  if (a === 'enrollment_apology_status') {
    const { data: rows, error } = await db.from('email_delivery_log').select('status').eq('campaign_key', ENROLLMENT_FIX_CAMPAIGN);
    if (error) return out({ ok: false, error: 'Could not load campaign status' }, 500);
    const counts = { sent: 0, delivered: 0, failed: 0, pending: 0 };
    for (const row of rows || []) {
      if (row.status === 'delivered') counts.delivered++;
      else if (row.status === 'sent') counts.sent++;
      else if (['failed', 'expired', 'suppressed'].includes(row.status)) counts.failed++;
      else counts.pending++;
    }
    return out({ ok: true, campaign: ENROLLMENT_FIX_CAMPAIGN, total: (rows || []).length, ...counts });
  }

  if (a === 'send_enrollment_apology') {
    if (String(b.approval || '') !== 'APPROVED_SEND_ENROLLMENT_APOLOGY') return out({ ok: false, error: 'Explicit approval is required' }, 409);
    let recipients: any[];
    try { recipients = await affectedEnrollmentRecipients(db) } catch { return out({ ok: false, error: 'Could not audit affected enrollment recipients' }, 500) }
    const delivery = await createEmailDelivery(`enrollment-apology-${Date.now()}`);
    const results = [];
    for (const app of recipients) {
      const idempotencyKey = `${ENROLLMENT_FIX_CAMPAIGN}:${app.id}`;
      const rendered = await enrollmentApologyTemplate(app);
      await db.from('email_delivery_log').upsert({
        idempotency_key: idempotencyKey,
        email_type: 'academy_enrollment_link_fixed',
        recipient_email: app.email,
        recipient_name: app.name,
        recipient_id: app.id,
        campaign_key: ENROLLMENT_FIX_CAMPAIGN,
        subject: rendered.tpl.subject,
        status: 'pending',
        metadata: { template_key: rendered.tpl.key, template_version: rendered.tpl.version, template_source: rendered.tpl.source },
        max_attempts: 3,
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      const result = await delivery.send({
        idempotencyKey,
        emailType: 'academy_enrollment_link_fixed',
        to: app.email,
        toName: app.name,
        subject: rendered.tpl.subject,
        html: rendered.tpl.html,
        text: rendered.tpl.text,
        replyTo: 'academy@getassistara.com',
        fromName: rendered.tpl.senderName || 'Assistara Academy',
        campaignKey: ENROLLMENT_FIX_CAMPAIGN,
        recipientId: app.id,
        metadata: { template_key: rendered.tpl.key, template_version: rendered.tpl.version, template_source: rendered.tpl.source },
      } as import("../_shared/email-delivery.ts").EmailDeliveryOptions);
      results.push({ application_id: app.id, success: result.success, status: result.status, provider: result.provider });
    }
    return out({ ok: results.every((result: any) => result.success), campaign: ENROLLMENT_FIX_CAMPAIGN, total: results.length, results });
  }

  if (a === 'decision' || a === 'resend_decision') {
    const id = String(b.id || ''), d = String(b.decision || '');
    if (!['accepted', 'declined'].includes(d)) return out({ ok: false, error: 'Invalid decision' }, 400);
    const { data: app } = await db.from('academy_applications').select('*').eq('id', id).maybeSingle();
    if (!app) return out({ ok: false, error: 'Application not found' }, 404);
    const now = new Date().toISOString();
    if (a === 'decision') {
      const patch = d === 'accepted' ? { decision: 'accepted', status: 'accepted', accepted_at: now, declined_at: null, opened_at: now, reviewed_at: now } : { decision: 'waitlisted', status: 'waitlisted', waitlisted_at: now, declined_at: null, accepted_at: null, opened_at: now, reviewed_at: now };
      const r = await db.from('academy_applications').update(patch).eq('id', id);
      if (r.error) return out({ ok: false, error: r.error.message }, 500);
    }

    const delivery = await createEmailDelivery('admin-applications');
    const idempotencyKey = `admin-decision-${app.id}-${Date.now()}`;

    // Pre-create delivery log to satisfy FK constraint on email_delivery_claim
    // (masterclass-reminder does this pattern; see _shared/email-delivery.ts claimDelivery RPC)
    const deadline = new Date(Date.now() + 24 * 3600e3).toISOString();
    const emailType = d === 'accepted' ? 'academy_acceptance' : 'academy_declined';
    const campaignKey = 'academy_decisions';

    // Check for assigned promo code on the applicant record
    const assignedPromoId = app.assigned_promo_code_id;
    let isDiscounted = false;
    let assignedPromoCode = null;
    let assignedPromoAmount = null;

    if (d === 'accepted' && assignedPromoId) {
      const { data: promo } = await db
        .from('academy_promo_codes')
        .select('code, amount_php')
        .eq('id', assignedPromoId)
        .maybeSingle();
      if (promo && promo.active && (!promo.expires_at || new Date(promo.expires_at).getTime() > Date.now())) {
        isDiscounted = true;
        assignedPromoCode = promo.code;
        assignedPromoAmount = promo.amount_php;
      }
    }

    const templateKey = isDiscounted ? 'academy_application_accepted_discounted' : (d === 'accepted' ? 'academy_application_accepted' : 'academy_application_waitlisted');
    const emailSubject = isDiscounted ? "You're IN! Welcome to Assistara Academy 🎉💛" : (d === 'accepted' ? "You're IN! Your Assistara Academy application is approved!" : "Not this round, but you're on our list!");

    await db.from('email_delivery_log').insert({
      idempotency_key: idempotencyKey,
      email_type: emailType,
      recipient_email: app.email,
      recipient_name: app.name,
      subject: emailSubject,
      deadline,
      metadata: { campaign: campaignKey, template_key: templateKey, template_version: 0, template_source: 'fallback' },
      max_attempts: 3
    }, { returning: 'minimal' });

    if (d === 'accepted') {
      const url = `${SITE}/academy/checkout?token=${encodeURIComponent(app.enrollment_token)}`;
      const first = esc((app.name || 'there').split(/\s+/)[0]);
      const note = `We may accept more applicants than the ${LIMIT} available spots. Acceptance does not guarantee a seat. Only the first ${LIMIT} accepted applicants to complete payment will secure their place in this cohort.`;
      // Published dashboard template (if any) wins; otherwise the inline HTML below.
      const regularPrice = '₱6,900';
      const discountedPrice = isDiscounted && assignedPromoAmount ? `₱${assignedPromoAmount}` : '₱4,900';
      const couponCode = isDiscounted && assignedPromoCode ? assignedPromoCode : 'MASTERCLASS';

      const tpl = await resolveEmailTemplate(templateKey, isDiscounted
        ? { first_name: first, checkout_url: url, limit: LIMIT, name: app.name, coupon_code: couponCode, regular_price: regularPrice, discounted_price: discountedPrice }
        : { first_name: first, checkout_url: url, limit: LIMIT, name: app.name }, () => ({
        subject: emailSubject,
        html: isDiscounted
          ? shell("You're IN! Welcome to Assistara Academy! 🎉💛", `<p>Hi ${first},</p><p>We've reviewed your application, and we have some exciting news...</p><p><strong>You've been ACCEPTED into Assistara Academy!</strong> 🎉</p><p>We're so happy to welcome you to our first generation of students!</p><p>You took the first step by applying, and now we're excited to help you take the next one: building real skills, gaining confidence, and working toward your first remote client.</p><h3 style="font-size:20px;margin:24px 0 12px">A little welcome gift from us! 🎁💛</h3><p>Since we're welcoming our very first generation of Assistara Academy students, we wanted to make the occasion a little more special.</p><p><strong>We're giving you ₱2,000 OFF your Academy enrollment!</strong></p><p style="font-size:18px;font-weight:700;color:#151515;margin:16px 0">Regular price: <span style="text-decoration:line-through;color:#77716a">${regularPrice}</span></p><p style="font-size:24px;font-weight:800;color:#176638;margin:8px 0"><strong>Your welcome price: ${discountedPrice} 💛</strong></p><p style="background:#fff9df;border:1px solid #e6c353;border-radius:12px;padding:16px;color:#151515;font-weight:700">Your welcome code: <strong style="font-family:monospace;font-size:18px">${couponCode}</strong></p><p>Simply enter <strong>${couponCode}</strong> at checkout and click <strong>Apply</strong> to unlock your discount.</p><h3 style="font-size:20px;margin:24px 0 12px">Your next step 🚀</h3><p>We're keeping our first Academy batch small, with <strong>only ${LIMIT} spots available</strong>, so we can give our founding students the attention and support they deserve.</p><p>Your application has been approved, but your spot is only secured once you've completed enrollment.</p>`, { label: 'SECURE MY ACADEMY SPOT →', href: url })
          : shell("You're IN! Welcome to Assistara Academy!", `<p>Hi ${first},</p><h2 style="font-size:22px;margin:20px 0 8px">You did it!</h2><p>We've reviewed your application, and we're excited to offer you a place in the <strong>Assistara Academy Founding Cohort!</strong></p><p>You're one step closer to building your skills, finding your first remote client, and creating new opportunities for yourself.</p><p><strong>Here's the important part:</strong></p><div style="background:#fff9df;border:1px solid #e6c353;border-radius:12px;padding:18px;color:#151515"><strong>Only ${LIMIT} paid spots available!</strong><br>Your application has been accepted, but your seat isn't reserved just yet. Spots are confirmed once payment is completed.</div><p>Ready to make it official? Secure your place and let's get started!</p><p>See you inside!<br><strong>The Assistara Team</strong></p>`, { label: 'YES! Secure my spot', href: url }),
        text: isDiscounted
          ? `You're IN! Welcome to Assistara Academy! 🎉💛\n\nHi ${first},\n\nWe've reviewed your application, and we have some exciting news...\n\nYou've been ACCEPTED into Assistara Academy! 🎉\n\nWe're so happy to welcome you to our first generation of students!\n\nYou took the first step by applying, and now we're excited to help you take the next one: building real skills, gaining confidence, and working toward your first remote client.\n\nA little welcome gift from us! 🎁💛\n\nSince we're welcoming our very first generation of Assistara Academy students, we wanted to make the occasion a little more special.\n\nWe're giving you ₱2,000 OFF your Academy enrollment!\n\nRegular price: ${regularPrice}\n\nYour welcome price: ${discountedPrice} 💛\n\nYour welcome code: ${couponCode}\n\nSimply enter ${couponCode} at checkout and click Apply to unlock your discount.\n\nYour next step 🚀\n\nWe're keeping our first Academy batch small, with only ${LIMIT} spots available, so we can give our founding students the attention and support they deserve.\n\nYour application has been approved, but your spot is only secured once you've completed enrollment.\n\nSECURE MY ACADEMY SPOT →\n${url}\n\nWe can't wait to welcome you inside, ${first}!\n\nHere's to new skills, new opportunities, and the beginning of something exciting. 💛\n\nXyra & the Assistara Team\n\nP.S. Remember to enter your welcome code ${couponCode} at checkout to receive your discount!`
          : `You're IN! Welcome to Assistara Academy!\n\nHi ${first},\n\nYou did it! We've reviewed your application, and we're excited to offer you a place in the Assistara Academy Founding Cohort!\n\nOnly ${LIMIT} paid spots available! Your application has been accepted, but your seat isn't reserved just yet. Spots are confirmed once payment is completed.\n\nYES! Secure my spot:\n${url}\n\nSee you inside!\nThe Assistara Team\n\nA quick note: ${note}`,
        senderName: isDiscounted ? 'Xyra & the Assistara Team' : 'Assistara Academy',
      }));
      const { html, text } = tpl;

      const result = await delivery.send({
        idempotencyKey,
        emailType: 'academy_acceptance',
        to: app.email, toName: app.name,
        subject: tpl.subject,
        html, text, replyTo: 'academy@getassistara.com', campaignKey: 'academy_decisions', recipientId: app.id,
      } as import("../_shared/email-delivery.ts").EmailDeliveryOptions);

      await log(db, 'academy_application', app.id, 'decision_email_sent', { decision: 'accepted', email_sent: result.success, provider: result.provider, template_key: tpl.key, template_version: tpl.version, template_source: tpl.source });
      return result.success ? out({ ok: true, enrollment_url: url }) : out({ ok: false, error: 'Decision saved, but acceptance email could not be sent' }, 502);
    }

    const first = esc((app.name || 'there').split(/\s+/)[0]);
    // Published dashboard template (if any) wins; otherwise the inline HTML below.
    const tpl = await resolveEmailTemplate('academy_application_waitlisted', { first_name: first, name: app.name }, () => ({
      subject: "Not this round, but you're on our list!",
      html: shell("Not this round, but you're on our list!", `<p>Hi ${first},</p><p>We've got some news for you!</p><p>The response to Assistara Academy has been incredible, and unfortunately, we couldn't offer you a spot in our first cohort.</p><p><strong>But fear not! You're on our waitlist!</strong></p><p>That means you'll be among the first to hear when spots open up or our next cohort launches.</p><p>Your journey toward landing your first remote client doesn't stop here. We're excited to hopefully have you join us next time!</p><p>Keep an eye on your inbox. We'll be in touch!</p><p><strong>See you soon!</strong><br>The Assistara Team</p>`),
      text: `Not this round, but you're on our list!\n\nHi ${first},\n\nWe've got some news for you!\n\nThe response to Assistara Academy has been incredible, and unfortunately, we couldn't offer you a spot in our first cohort.\n\nBut fear not! You're on our waitlist!\n\nThat means you'll be among the first to hear when spots open up or our next cohort launches.\n\nKeep an eye on your inbox. We'll be in touch!\n\nSee you soon!\nThe Assistara Team`,
      senderName: 'Assistara Academy',
    }));
    const { html, text } = tpl;

    const result = await delivery.send({
      idempotencyKey,
      emailType: 'academy_declined',
      to: app.email, toName: app.name,
      subject: tpl.subject,
      html, text, replyTo: 'academy@getassistara.com', campaignKey: 'academy_decisions', recipientId: app.id,
    } as import("../_shared/email-delivery.ts").EmailDeliveryOptions);

    await log(db, 'academy_application', app.id, 'decision_email_sent', { decision: 'declined', email_sent: result.success, provider: result.provider, template_key: tpl.key, template_version: tpl.version, template_source: tpl.source });
    return result.success ? out({ ok: true }) : out({ ok: false, error: 'Decision saved, but decline email could not be sent' }, 502);
  }

  if (a === 'delete_signup') { const r = await db.from('masterclass_signups').delete().eq('id', String(b.id || '')); return r.error ? out({ ok: false, error: r.error.message }, 500) : out({ ok: true }) }
  if (a === 'delete_b2b') { const r = await db.from('b2b_leads').delete().eq('id', String(b.id || '')); return r.error ? out({ ok: false, error: r.error.message }, 500) : out({ ok: true }) }
  if (a === 'delete_application') { const r = await db.from('academy_applications').delete().eq('id', String(b.id || '')); return r.error ? out({ ok: false, error: r.error.message }, 500) : out({ ok: true }) }
  if (a === 'send_onboarding_email') { return out({ ok: false, error: 'Use onboarding endpoint' }, 400) }
  if (a === 'send_password_reset' || a === 'delete_account' || a === 'suspend_account' || a === 'update_application' || a === 'update_webinar' || a === 'update_b2b' || a === 'open' || a === 'open_b2b') return out({ ok: false, error: 'This admin action is temporarily unavailable' }, 503);
  return out({ ok: false, error: 'Unknown action' }, 400);
});
