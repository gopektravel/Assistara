-- Isolated regression / delete guard (DO NOT RUN ON PRODUCTION WITHOUT AUTH CHECK)
-- Soft delete: only allow if status = 'draft'; set status = 'deleted'; preserve html/versions/audit
BEGIN;
-- Example guard query (read-only in production; test only on non-critical keys)
SELECT key, status FROM email_templates WHERE status = 'draft' AND key = 'test_delete_isolated';
COMMIT;
-- Recommended server-side rule for delete_draft endpoint:
-- 1. Require admin HMAC token (assistara_admin_token)
-- 2. SELECT status FROM email_templates WHERE key = $1
-- 3. If status != 'draft' => reject (published protected)
-- 4. UPDATE email_templates SET status = 'deleted', updated_at = now() WHERE key = $1 AND status = 'draft';
-- 5. Log to audit; do NOT delete html / versions / delivery logs
-- 6. Restore: UPDATE ... SET status = 'draft' WHERE key = $1 AND status = 'deleted';
