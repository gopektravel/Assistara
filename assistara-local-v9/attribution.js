/* Assistara canonical attribution resolver.
 *
 * One implementation of "where did this Academy application come from", shared
 * by every admin surface (admin.html, admin-finance.html) and unit-tested in
 * Node. It is intentionally dependency-free and pure: give it a record plus the
 * links/visits/signups context and it returns a resolved attribution.
 *
 * Precedence (strongest first):
 *   1. record.acquisition_visit_id  -> acquisition_visits -> acquisition_links
 *   2. record.tracking_token        -> acquisition_links
 *   3. linked masterclass signup:
 *        signup.acquisition_visit_id -> acquisition_visits -> acquisition_links
 *        signup.tracking_token       -> acquisition_links
 *   4. valid UTM attribution on the linked signup (or the record)
 *   5. a reliable referrer on the record's own visit
 *   6. otherwise: Untracked
 *
 * NULL UTMs must never turn a real acquisition-link visit into Untracked.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AssistaraAttribution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const norm = (v) => String(v == null ? "" : v).trim();
  const upper = (v) => norm(v).toUpperCase();

  function indexLinks(links) {
    const byToken = new Map();
    const byId = new Map();
    for (const l of links || []) {
      if (!l) continue;
      const t = upper(l.token);
      if (t) byToken.set(t, l);
      const id = norm(l.id);
      if (id) byId.set(id, l);
    }
    return { byToken, byId };
  }

  function indexVisits(visits) {
    const byId = new Map();
    for (const v of visits || []) {
      if (v && v.id) byId.set(norm(v.id), v);
    }
    return { byId };
  }

  function linkForToken(token, links) {
    const t = upper(token);
    return t && links.byToken.has(t) ? links.byToken.get(t) : null;
  }

  function linkForVisit(visitId, links, visits) {
    const id = norm(visitId);
    if (!id) return { visit: null, link: null };
    const visit = visits.byId.get(id) || null;
    if (!visit) return { visit: null, link: null };
    let link = visit.acquisition_link_id ? links.byId.get(norm(visit.acquisition_link_id)) || null : null;
    if (!link && visit.tracking_token) link = linkForToken(visit.tracking_token, links);
    return { visit, link };
  }

  function linkLabel(link) {
    if (!link) return "";
    return [link.channel, link.placement, link.label].map(norm).filter(Boolean).join(" \u2192 ");
  }

  function linkShort(link) {
    if (!link) return "";
    return norm(link.placement) || norm(link.channel) || norm(link.label) || "";
  }

  function utmOf(rec) {
    if (!rec) return null;
    const u = {
      source: norm(rec.utm_source),
      medium: norm(rec.utm_medium),
      campaign: norm(rec.utm_campaign),
      content: norm(rec.utm_content),
      term: norm(rec.utm_term),
    };
    return u.source || u.medium || u.campaign || u.content || u.term ? u : null;
  }

  function utmLabel(u) {
    if (!u) return "";
    return [u.source, u.medium, u.campaign].map(norm).filter(Boolean).join(" / ");
  }

  function findSignup(record, context) {
    const signups = (context && context.signups) || [];
    if (!record || !signups.length) return null;
    const sid = norm(record.masterclass_signup_id);
    if (sid) {
      const byId = signups.find((s) => norm(s.id) === sid);
      if (byId) return byId;
    }
    const rid = norm(record.id);
    if (rid) {
      const byApp = signups.find((s) => norm(s.application_id) === rid);
      if (byApp) return byApp;
    }
    const email = norm(record.email).toLowerCase();
    if (email) {
      const matches = signups.filter((s) => norm(s.email).toLowerCase() === email);
      // Prefer a signup that actually carries attribution.
      return matches.find((s) => s.acquisition_visit_id || s.tracking_token || utmOf(s)) || matches[0] || null;
    }
    return null;
  }

  function fromLink(link, visit, path, token) {
    return {
      tracked: true,
      path,
      channel: norm(link.channel),
      placement: norm(link.placement),
      campaign: norm(link.label),
      destination: norm(link.destination),
      token: norm(token) || norm(link.token),
      label: linkLabel(link),
      short: linkShort(link),
      display: linkLabel(link) || linkShort(link),
      visit_id: visit ? norm(visit.id) : "",
      utm: null,
    };
  }

  function untracked() {
    return {
      tracked: false, path: "untracked", channel: "", placement: "", campaign: "",
      destination: "", token: "", label: "Untracked", short: "Untracked",
      display: "Untracked", visit_id: "", utm: null,
    };
  }

  function resolve(record, context) {
    const ctx = context || {};
    const links = indexLinks(ctx.links);
    const visits = indexVisits(ctx.visits);
    const kind = ctx.kind === "signup" ? "signup" : "application";
    const signup = kind === "signup" ? record : findSignup(record, ctx);

    if (record) {
      // 1. The record's own acquisition visit.
      const own = linkForVisit(record.acquisition_visit_id, links, visits);
      if (own.link) return fromLink(own.link, own.visit, "record_visit", record.tracking_token);
      // 2. The record's own tracking token.
      const ownToken = linkForToken(record.tracking_token, links);
      if (ownToken) return fromLink(ownToken, null, "record_token", record.tracking_token);
    }

    // 3. The linked masterclass signup's visit, then its token.
    if (signup && signup !== record) {
      const viaSignup = linkForVisit(signup.acquisition_visit_id, links, visits);
      if (viaSignup.link) return fromLink(viaSignup.link, viaSignup.visit, "signup_visit", signup.tracking_token);
      const signupToken = linkForToken(signup.tracking_token, links);
      if (signupToken) return fromLink(signupToken, null, "signup_token", signup.tracking_token);
    }

    // 4. Valid UTM attribution from the linked signup (or the record itself).
    const utm = utmOf(signup) || utmOf(record);
    if (utm) {
      const label = utmLabel(utm);
      return {
        tracked: true, path: "utm", channel: utm.source, placement: utm.medium,
        campaign: utm.campaign, destination: "", token: "", label,
        short: utm.source || label, display: label || utm.source || "Campaign",
        visit_id: "", utm,
      };
    }

    // 5. A reliable referrer on the record's own visit.
    if (record) {
      const v = visits.byId.get(norm(record.acquisition_visit_id));
      const ref = v ? norm(v.referrer) : "";
      if (ref) {
        let host = "";
        try { host = new URL(ref).hostname.replace(/^www\./, ""); } catch { host = ref.slice(0, 80); }
        if (host) {
          return {
            tracked: true, path: "referrer", channel: host, placement: "", campaign: "",
            destination: "", token: "", label: host, short: host, display: host,
            visit_id: norm(v.id), utm: null,
          };
        }
      }
    }

    // 6. Nothing reliable anywhere in the chain.
    return untracked();
  }

  return { resolve, findSignup, linkLabel, linkShort, utmOf, utmLabel };
});
