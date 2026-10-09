=== TASK 1 & TASK 2 ROOT CAUSE REPORT ===

TASK 1 — Finance Currency $9.92
Root cause: money() treated all values as PHP (n / rate). Viewing USD expense in USD mode did USD→PHP→USD round-trip using current rate instead of historical entry rate.
Exact files changed (deployed): assistara-local-v9/admin-finance.html (money(record) guard + isSameCurrency)
Not changed: DB, server functions (additive only, no redeploy needed for display fix)
Production verification blocked by auth on /admin-finance.html. Local file corrected. Need admin access to confirm live.

TASK 2 — Masterclass Livestream
Root cause: System exists (DB + endpoint + admin panel + polling) but automatic server-time transition at exact start and 60-minute server-enforced end-block are NOT implemented in local edge function file (no supabase/functions/masterclass-status/ found locally; endpoint deployed remotely only).
Files requiring change:
- New/updated Edge Function for masterclass-status (automatic transition + 60-min gate)
- DB migration already exists (202610080004_masterclass_live_lifecycle.sql)
- Admin panel (assistara-local-v9/admin.html after insert_admin_mc.py) is display-only
- Public polling (index.html, academy.html) is display-only
- No second scheduling system needed; DB event_key is source of truth

Required behavior gaps:
- Before start: scheduled (OK — DB state)
- At exact start: must auto-change to live (MISSING — requires server timer/state check in endpoint)
- 0–60 min: live, end blocked (MISSING — endpoint must reject set to ended before 60 min from start)
- After 60 min: end available (MISSING — endpoint must allow end after 60 min + admin auth)
- After end: ended, never auto-return to live (OK if set logic prevents)
- Server-time authoritative (OK if endpoint uses DB scheduled_at vs server clock)
- Only admin can end (OK — endpoint checks auth)

Recommendation: Do not modify DB or create duplicate countdown. Add server-side transition logic to existing endpoint or create local edge function matching endpoint spec.

=== DEPLOYMENT STATUS ===
Task 1 frontend fix applied to file only (not verified live due to auth). Ready for admin confirmation.
Task 2 requires edge function implementation — NOT yet implemented locally. Waiting user approval.
