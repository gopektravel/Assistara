"use strict";

// Public, read-only cohort capacity probe for the Academy apply page.
// It calls the SAME server-side capacity function the Admin uses and never
// reads applicant/payment records, never reserves a seat and never charges.
// If the probe fails it fails OPEN (never blocks an application); the checkout
// still enforces the 15-seat limit server-side.

const { config, noStore } = require("./_academy-security");

const COHORT = "founding-2026";

module.exports = async function academyCheckCapacity(req, res) {
  noStore(res);
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }

  try {
    const cfg = config();
    const r = await fetch(`${cfg.url}/rest/v1/rpc/academy_capacity_overview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.service,
        Authorization: `Bearer ${cfg.service}`,
      },
      body: JSON.stringify({ p_cohort_code: COHORT }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) throw new Error("capacity unavailable");
    const capacity = Number(data.capacity ?? 15);
    const available = Number(data.available ?? 0);
    const open = data.is_open !== false && available > 0;
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, capacity, available, open, full: !open }));
  } catch (error) {
    console.error("academy-check-capacity", error.message);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: false, open: true, full: false }));
  }
};
