import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  verifyOpenToken,
  verifyClickToken,
  classifyUserAgent,
  type TrafficClass,
} from "../_shared/email-tracking.ts";

// ----------------------------------------------------------------------------
// First-party email tracking endpoint (Assistara-owned).
//
//   GET /email-track/o?t=<openToken>   -> 1x1 transparent GIF (+ records an open)
//   GET /email-track/c?t=<clickToken>  -> 302 to the stored destination
//
// Security & privacy:
//   * Tokens are opaque + HMAC-verified; an invalid token is served/redirected
//     harmlessly (the pixel still returns 200; a bad click falls back to the
//     site homepage) so token validity is never leaked.
//   * The destination is read from email_tracking_links, never from the URL, so
//     a forged token can never open-redirect and a livestream token can never
//     appear in a tracking URL.
//   * Recipients on the global suppression list are not tracked (unsubscribe is
//     respected). No IP or raw user agent is stored — only a coarse class.
//   * This function imports only _shared/email-tracking, so it is never a sender.
// ----------------------------------------------------------------------------

const U = Deno.env.get("SUPABASE_URL")!;
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("TRACKING_SECRET") || "";
const FALLBACK = Deno.env.get("TRACKING_FALLBACK_URL") || "https://www.getassistara.com/";

// 1x1 transparent GIF.
const GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

const pixel = () => new Response(GIF, { status: 200, headers: PIXEL_HEADERS });

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

interface Delivery {
  id: string;
  recipient_email: string | null;
  campaign_key: string | null;
  email_type: string | null;
  recipient_id: string | null;
  provider: string | null;
}

async function getDelivery(trackingId: string): Promise<Delivery | null> {
  try {
    const r = await rest(
      `email_delivery_log?tracking_id=eq.${encodeURIComponent(trackingId)}` +
        `&select=id,recipient_email,campaign_key,email_type,recipient_id,provider&limit=1`,
    );
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? (rows[0] as Delivery) : null;
  } catch {
    return null;
  }
}

async function isSuppressed(email: string | null): Promise<boolean> {
  if (!email) return false;
  try {
    const r = await rest(
      `email_suppressions?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email&limit=1`,
    );
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false; // fail-open for serving; suppression already enforced at send
  }
}

function lowerHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

async function recordEvent(
  delivery: Delivery,
  eventType: "opened" | "clicked",
  dedupKey: string,
  linkIndex: number | null,
  traffic: TrafficClass,
): Promise<void> {
  try {
    const insert = await rest("email_events?on_conflict=dedup_key&select=id", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
      body: JSON.stringify([
        {
          delivery_log_id: delivery.id,
          campaign_key: delivery.campaign_key,
          email_type: delivery.email_type,
          recipient_email: delivery.recipient_email,
          recipient_id: delivery.recipient_id,
          provider: delivery.provider || "resend",
          event_type: eventType,
          event_timestamp: new Date().toISOString(),
          source: "first_party",
          measurement: "first_party",
          // Opens are provisional (proxies/image-blocking); a scanner-suspected
          // click is reported, not measured as confirmed engagement.
          reliability: eventType === "opened" || traffic.suspectedBot ? "reported" : "measured",
          dedup_key: dedupKey,
          suspected_bot: traffic.suspectedBot,
          link_index: linkIndex,
          user_agent_class: traffic.userAgentClass,
          payload: {
            link_index: linkIndex,
            user_agent_class: traffic.userAgentClass,
            suspected_bot: traffic.suspectedBot,
          },
        },
      ]),
    });
    const rows = await insert.json().catch(() => []);
    // Only fold into the message when this event is genuinely new.
    if (!Array.isArray(rows) || rows.length === 0) return;
    await rest("rpc/email_apply_first_party_event", {
      method: "POST",
      body: JSON.stringify({
        p_delivery_log_id: delivery.id,
        p_event_type: eventType,
        p_ts: new Date().toISOString(),
        p_suspected_bot: traffic.suspectedBot,
      }),
    });
  } catch {
    // tracking must never break the pixel/redirect response
  }
}

function trackingKind(url: URL): "open" | "click" {
  const last = url.pathname.split("/").filter(Boolean).pop() || "";
  const hinted = (url.searchParams.get("k") || "").toLowerCase();
  if (last === "c" || hinted === "click" || hinted === "c") return "click";
  return "open";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const kind = trackingKind(url);
  const token = url.searchParams.get("t") || "";
  const headers = lowerHeaders(req);
  const traffic = classifyUserAgent(headers["user-agent"] || "", headers, kind);

  if (kind === "click") {
    const verified = await verifyClickToken(SECRET, token);
    if (!verified) return Response.redirect(FALLBACK, 302);

    const delivery = await getDelivery(verified.trackingId);
    if (!delivery) return Response.redirect(FALLBACK, 302);
    if (await isSuppressed(delivery.recipient_email)) return Response.redirect(FALLBACK, 302);

    let destination: string | null = null;
    try {
      const r = await rest(
        `email_tracking_links?delivery_log_id=eq.${delivery.id}` +
          `&link_index=eq.${verified.linkIndex}&select=destination_url&limit=1`,
      );
      const rows = await r.json().catch(() => []);
      destination = Array.isArray(rows) && rows[0] ? String(rows[0].destination_url) : null;
    } catch {
      destination = null;
    }

    // Only ever redirect to an http(s) URL we stored ourselves.
    if (!destination || !/^https?:\/\//i.test(destination)) {
      return Response.redirect(FALLBACK, 302);
    }

    await recordEvent(
      delivery,
      "clicked",
      `fp:click:${delivery.id}:${verified.linkIndex}`,
      verified.linkIndex,
      traffic,
    );

    return new Response(null, {
      status: 302,
      headers: { Location: destination, "Cache-Control": "no-store, no-cache, private, max-age=0" },
    });
  }

  // Open pixel: always answer 200 with the image; validity is never revealed.
  const trackingId = await verifyOpenToken(SECRET, token);
  if (trackingId) {
    const delivery = await getDelivery(trackingId);
    if (delivery && !(await isSuppressed(delivery.recipient_email))) {
      await recordEvent(delivery, "opened", `fp:open:${delivery.id}`, null, traffic);
    }
  }
  return pixel();
});
