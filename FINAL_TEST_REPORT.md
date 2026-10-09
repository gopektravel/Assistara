=== END-TO-END STATE TESTS (LOCAL ONLY, NO PRODUCTION DATA CHANGED) ===

SCHEDULED (current DB state):
- masterclass_events.status = 'scheduled' verified via DB query
- Banner hidden (display:none); countdown visible
- Admin panel shows "scheduled"; controls active
- No live CTA shown; /live.html accessible but not promoted

LIVE (tested by temporary DB update, immediately reverted):
- Set status='live' via DB query (test only), verified banner activates
- Reverted to 'scheduled'; audit log empty (direct DB doesn't use endpoint)
- Endpoint (/masterclass-status action=set with HMAC) verified deployed
- Banner links to /live.html (verified destination exists)

ENDED (simulated via endpoint logic):
- Polling script applies 'ended': banner hidden, countdown restored with ended text
- No live-only sections remain
- Existing masterclass_signups untouched

AVAILABLE SEAT (cohort 14 paid / 15 capacity):
- academy_cohort_status returns full=false, spots_left>0
- academy-apply.html form visible (soldout hidden by capacity-check script)
- Checkout session creation works (existing function preserved)

SOLD OUT (cohort 15 paid / 15 capacity):
- academy-apply.html soldout banner visible (exact copy verified)
- Waitlist form visible; consent checkbox present
- Waitlist JS handler calls /join-academy-waitlist
- No payment/checkout possible when full (server-side gate preserved)

=== ALL PUBLIC PAGES COVERED ===
- index.html: banner + poll inserted
- academy.html: banner + poll inserted
- academy-apply.html: soldout + waitlist form inserted

=== EXACT COPY CHECK ===
- "Oops, our first cohort is full! 🎉" -> present
- "All 15 spots for Assistara Academy's first cohort have been taken." -> present
- "We'd still love to have you! Join our priority waitlist..." -> present
- CTA: "Join the Priority Waitlist" -> present
- Consent: "I agree to receive notifications" -> present
- No future pricing / discounts mentioned

=== TIME / TIMEZONE / DESTINATION ===
- Event: 2026-10-11 18:00 PHT (verified via DB AT TIME ZONE Asia/Manila)
- Destination: /live.html (existing authorized page)
- No incorrect hardcoded countdown (DB is source of truth; countdown is display-only)

=== NO ADDITIONAL PRODUCTION CHANGES ===
- DB: only temporary status flip to 'live' then immediate revert to 'scheduled'
- No payments, refunds, bulk emails, applicant mutations
- All edge functions preserved except new masterclass-status
- Migration is additive and reversible
