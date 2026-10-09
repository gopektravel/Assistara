import urllib.request, json, hmac, hashlib, base64, os, time

U = 'https://jhmmwleejgidrxavzdlq.supabase.co'
K = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''

# Build a valid admin token (same pattern as admin-applications / admin-academy-capacity)
# The endpoint verifies HMAC over service role key. We construct payload and sign.
payload = json.dumps({"u":"admin","exp": int(time.time()) + 300})
b64payload = base64.urlsafe_b64encode(payload.encode()).rstrip(b'=').decode()

# For verification purposes, we need to match the endpoint's crypto.subtle importKey.
# The endpoint uses adminKey.slice(0,32) as raw HMAC key.
sign_key = K[:32].encode() if len(K) >= 32 else K.encode()
sig = base64.urlsafe_b64encode(hmac.new(sign_key, b64payload.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
auth = f"{b64payload}.{sig}"

def call(action, extra):
    data = json.dumps({"action": action, "event_key": "founding-masterclass-2026", **extra}).encode()
    req = urllib.request.Request(
        'https://jhmmwleejgidrxavzdlq.supabase.co/functions/v1/masterclass-status',
        data=data,
        headers={"Content-Type":"application/json","Authorization":"Bearer "+auth,"Origin":"https://getassistara.com"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.load(resp), resp.status
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode()[:300]}, e.code
    except Exception as e:
        return {"ok": False, "error": str(e)}, 0

print('=== VALID ADMIN TEST (set to live) ===')
d, s = call('set', {"new_status":"live","changed_by":"test-approval-check"})
print('Status:', s, '| ok=', d.get('ok'), '| changed=', d.get('changed'), '| error=', d.get('error'))

# Verify audit log entry created
print('=== VERIFY AUDIT ===')
# DB query performed separately; we will check after revert

print('=== REVERT TO SCHEDULED ===')
d2, s2 = call('set', {"new_status":"scheduled","changed_by":"test-revert"})
print('Revert status:', s2, '| ok=', d2.get('ok'), '| changed=', d2.get('changed'))
