// ----------------------------------------------------------------------------
// Email Template Studio — admin data API.
//
// Powers the "Templates" section of the Email Command Center:
//   list / get / save_draft / publish / rollback / versions / test_send /
//   preview / import / archive / delete / duplicate
//
// Auth: the same HMAC admin session token used by the other admin functions.
// Safety:
//   * Importing creates DRAFTS only — production email is untouched until a
//     template is explicitly published.
//   * Publishing validates required variables and links first.
//   * Test sends go to internal addresses only and are prefixed [TEST].
//   * Provider routing (Resend → Brevo → Sender.net) and provider-native
//     tracking are untouched; this function sends via createEmailDelivery().
// ----------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailDelivery } from "../_shared/email-delivery.ts";
import {
  renderVars,
  extractVars,
  htmlToText,
  validateTemplate,
  type TemplateIssue,
} from "../_shared/email-templates.ts";
import { TEMPLATES, findTemplateDef } from "../_shared/email-template-registry.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://www.getassistara.com";
const INTERNAL_TEST_DOMAIN = "getassistara.com";
const TEST_INTERNAL_DEFAULT = ["notifications@getassistara.com"];
const TEST_INTERNAL = Array.from(new Set([
  ...TEST_INTERNAL_DEFAULT,
  ...(Deno.env.get("TEMPLATE_TEST_EMAIL") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
])).filter((a) => a.endsWith("@" + INTERNAL_TEST_DOMAIN));

const allowed = new Set([
  "https://getassistara.com", "https://www.getassistara.com",
  "http://localhost:3000", "http://localhost:3001",
  "http://127.0.0.1:3000", "http://127.0.0.1:3001",
]);
const good = (origin: string | null) => !!origin && (allowed.has(origin) || origin.endsWith(".vercel.app"));
const headers = (origin: string | null) => ({
  "content-type": "application/json",
  "access-control-allow-origin": good(origin) ? origin! : SITE,
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "POST,OPTIONS",
  vary: "Origin",
});

const encoder = new TextEncoder();
const b64url = (v: Uint8Array) => btoa(String.fromCharCode(...v)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromB64url = (v: string) =>
  Uint8Array.from(atob(v.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (v.length % 4)) % 4)), (c) => c.charCodeAt(0));
async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}
async function admin(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature || (await sign(payload)) !== signature) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return !!data.v && data.v === (Deno.env.get("ADMIN_TOKEN_VERSION") || "") && data.u === "admin" && Date.now() < data.exp;
  } catch {
    return false;
  }
}

const clean = (v: unknown, max = 20000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Realistic sample data for any variable the registry knows about.
function sampleVars(key: string): Record<string, string> {
  const def = findTemplateDef(key);
  const out: Record<string, string> = {};
  for (const v of def?.vars || []) out[v.name] = v.sample;
  return out;
}

function stripHtml(html: string): string {
  return htmlToText(html).replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = headers(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST" || (origin && !good(origin))) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: h });
  }
  if (!(await admin(req))) {
    return new Response(JSON.stringify({ ok: false, error: "Session expired" }), { status: 401, headers: h });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
  const out = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });
  const action = String(body.action || "").toLowerCase();
  const who = clean(body.updated_by, 80) || "admin";

  try {
    // -----------------------------------------------------------------------
    // LIST — every template with status + preview snippet
    // -----------------------------------------------------------------------
    if (action === "list") {
      const includeArchived = body.include_archived === true;
      let q = db
        .from("email_templates")
        .select("id,key,name,category,subject,preview_text,status,is_critical,version,created_at,updated_at,published_at,sender_name")
        .order("updated_at", { ascending: false });
      if (!includeArchived) q = q.neq("status", "archived");
      const { data, error } = await q;
      if (error) return out({ ok: false, error: error.message }, 500);

      const rows = data || [];
      const usage: Record<string, number> = {};
      for (const key of rows.map((r: any) => r.key)) {
        try {
          const r = await db
            .from("email_delivery_log")
            .select("id", { count: "exact", head: true })
            .ilike("metadata->>template_key", key);
          usage[key] = r.count || 0;
        } catch { usage[key] = 0; }
      }

      const missing = TEMPLATES.filter((t) => !rows.some((r: any) => r.key === t.key)).map((t) => t.key);

      return out({
        ok: true,
        templates: rows.map((r: any) => ({
          ...r,
          preview: stripHtml(r.preview_text || r.subject || "").slice(0, 90),
          sends: usage[r.key] || 0,
        })),
        registry: TEMPLATES.map((t) => ({ key: t.key, name: t.name, category: t.category, imported: rows.some((r: any) => r.key === t.key) })),
        missing,
        generatedAt: new Date().toISOString(),
      });
    }

    // -----------------------------------------------------------------------
    // GET — one template + variables + versions
    // -----------------------------------------------------------------------
    if (action === "get") {
      const key = clean(body.key, 120);
      if (!key) return out({ ok: false, error: "key required" }, 400);
      let { data: t } = await db.from("email_templates").select("*").eq("key", key).maybeSingle();
      const def = findTemplateDef(key);

      // Not imported yet: return the registry definition so the editor can open it.
      if (!t) {
        if (!def) return out({ ok: false, error: "Unknown template key" }, 404);
        const built = def.render(def.samples);
        return out({
          ok: true,
          imported: false,
          template: {
            key, name: def.name, category: def.category, subject: built.subject,
            preview_text: def.previewText, html: built.html, text_content: built.text || "",
            status: "not_imported", version: 0, is_critical: def.isCritical,
            sender_name: built.senderName || "", sender_email: built.senderEmail || "", reply_to: built.replyTo || "",
            updated_at: null, published_at: null,
          },
          variables: def.vars.map((v) => ({ ...v, sample_value: v.sample })),
          versions: [],
        });
      }

      const [{ data: vars }, { data: versions }] = await Promise.all([
        db.from("email_template_variables").select("*").eq("template_id", t.id).order("sort_order", { ascending: true }),
        db.from("email_template_versions").select("id,version,subject,change_summary,created_by,created_at").eq("template_id", t.id).order("version", { ascending: false }),
      ]);

      const varRows = (vars || []).length
        ? vars!
        : (def?.vars || []).map((v, i) => ({
            name: v.name, label: v.label, description: v.description, type: v.type,
            required: v.required, sample_value: v.sample, source_hint: v.dynamic ? "generated per send" : "", sort_order: i,
          }));

      return out({
        ok: true,
        imported: true,
        template: t,
        variables: varRows,
        versions: versions || [],
        usedVars: extractVars(`${t.subject}\n${t.html}`),
      });
    }

    // -----------------------------------------------------------------------
    // SAVE DRAFT — create or update without touching production
    // -----------------------------------------------------------------------
    if (action === "save_draft") {
      const key = clean(body.key, 120);
      if (!key) return out({ ok: false, error: "key required" }, 400);
      const html = String(body.html ?? "");
      const subject = clean(body.subject, 300);
      const text = clean(body.text, 40000) || htmlToText(html);
      if (!subject) return out({ ok: false, error: "Subject is required" }, 400);
      if (!html) return out({ ok: false, error: "HTML is required" }, 400);

      const patch: Record<string, unknown> = {
        name: clean(body.name, 200) || key,
        category: ["transactional", "campaign", "internal"].includes(String(body.category)) ? String(body.category) : "transactional",
        subject,
        preview_text: clean(body.preview_text, 300),
        html,
        text_content: text,
        sender_name: clean(body.sender_name, 200) || null,
        sender_email: clean(body.sender_email, 200) || null,
        reply_to: clean(body.reply_to, 200) || null,
        status: "draft",
        updated_by: who,
      };

      const { data: existing } = await db.from("email_templates").select("id").eq("key", key).maybeSingle();
      let id: string;
      if (existing?.id) {
        id = existing.id;
        const { error } = await db.from("email_templates").update(patch).eq("id", id);
        if (error) return out({ ok: false, error: error.message }, 500);
      } else {
        const { data, error } = await db.from("email_templates").insert({ key, ...patch, version: 1, created_by: who }).select("id").maybeSingle();
        if (error) return out({ ok: false, error: error.message }, 500);
        id = data!.id;
      }

      // Keep the variable registry in sync with what the template declares.
      const vars = Array.isArray(body.variables) ? body.variables : [];
      if (vars.length) {
        await db.from("email_template_variables").delete().eq("template_id", id);
        const rows = vars.slice(0, 40).map((v: any, i: number) => ({
          template_id: id,
          name: String(v.name || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 60),
          label: String(v.label || v.name || "").slice(0, 120),
          description: String(v.description || "").slice(0, 400),
          type: ["string", "url", "number", "date", "boolean"].includes(String(v.type)) ? String(v.type) : "string",
          required: !!v.required,
          sample_value: String(v.sample ?? "").slice(0, 500),
          source_hint: String(v.source_hint || "").slice(0, 200),
          sort_order: i,
        })).filter((r: any) => r.name);
        if (rows.length) await db.from("email_template_variables").insert(rows);
      }

      return out({ ok: true, id, status: "draft", message: "Draft saved. Production email is unchanged." });
    }

    // -----------------------------------------------------------------------
    // PUBLISH — promote the current row to the live template
    // -----------------------------------------------------------------------
    if (action === "publish") {
      const key = clean(body.key, 120);
      const changeSummary = clean(body.change_summary, 300) || "Published from Email Template Studio";
      if (!key) return out({ ok: false, error: "key required" }, 400);

      const { data: t } = await db.from("email_templates").select("*").eq("key", key).maybeSingle();
      if (!t) return out({ ok: false, error: "Save a draft before publishing." }, 400);

      const { data: vars } = await db.from("email_template_variables").select("*").eq("template_id", t.id);
      const def = findTemplateDef(key);
      const varDefs = (vars && vars.length ? vars : def?.vars || []).map((v: any) => ({
        name: v.name, label: v.label, description: v.description, type: v.type,
        required: !!v.required, sample: String(v.sample_value ?? v.sample ?? ""), dynamic: v.dynamic === true,
      }));
      const requiredVars = varDefs.filter((v) => v.required).map((v) => v.name);
      const dynamicVars = varDefs.filter((v) => v.dynamic).map((v) => v.name);

      const issues: TemplateIssue[] = validateTemplate({
        subject: t.subject,
        html: t.html,
        text: t.text_content,
        requiredVars,
        requiredLinks: def?.requiredLinks,
        dynamicVars,
      });
      const errors = issues.filter((i) => i.severity === "error");
      if (errors.length) {
        return out({ ok: false, error: "Cannot publish yet", issues }, 400);
      }

      // Critical transactional templates require an explicit confirmation flag.
      if (t.is_critical && body.confirm !== true) {
        return out({ ok: false, error: "This is a critical transactional template — confirm to publish.", requireConfirmation: true }, 409);
      }

      // Archive the currently published content as a version, then bump.
      if (t.status === "published") {
        const { error: vErr } = await db.from("email_template_versions").insert({
          template_id: t.id, version: t.version, subject: t.subject, preview_text: t.preview_text,
          html: t.html, text_content: t.text_content, sender_name: t.sender_name, sender_email: t.sender_email,
          reply_to: t.reply_to, change_summary: clean(body.previous_summary, 300) || "Previous published version", created_by: who,
        });
        if (vErr && !String(vErr.message).includes("duplicate")) return out({ ok: false, error: vErr.message }, 500);
      }

      const { error } = await db.from("email_templates").update({
        status: "published",
        version: (t.version || 1) + (t.status === "published" ? 1 : 0),
        published_at: new Date().toISOString(),
        updated_by: who,
      }).eq("id", t.id);
      if (error) return out({ ok: false, error: error.message }, 500);

      // Keep the variable registry fresh from the declared list.
      if (varDefs.length) {
        await db.from("email_template_variables").delete().eq("template_id", t.id);
        await db.from("email_template_variables").insert(varDefs.map((v: any, i: number) => ({
          template_id: t.id, name: v.name, label: v.label || v.name, description: v.description || "",
          type: v.type || "string", required: !!v.required, sample_value: v.sample || "",
          source_hint: v.dynamic ? "generated per send" : "", sort_order: i,
        })));
      }

      return out({
        ok: true, published: true, version: (t.version || 1) + (t.status === "published" ? 1 : 0),
        warnings: issues.filter((i) => i.severity === "warning"),
        message: "Published. Assistara will use this version for all future sends of this email.",
      });
    }

    // -----------------------------------------------------------------------
    // ROLLBACK — restore an earlier published version
    // -----------------------------------------------------------------------
    if (action === "rollback") {
      const key = clean(body.key, 120);
      const version = Number(body.version);
      if (!key || !version) return out({ ok: false, error: "key and version required" }, 400);
      const { data: t } = await db.from("email_templates").select("*").eq("key", key).maybeSingle();
      if (!t) return out({ ok: false, error: "Template not found" }, 404);
      const { data: v } = await db.from("email_template_versions").select("*").eq("template_id", t.id).eq("version", version).maybeSingle();
      if (!v) return out({ ok: false, error: `Version ${version} not found` }, 404);

      // Snapshot the current published content before replacing it.
      if (t.status === "published") {
        await db.from("email_template_versions").insert({
          template_id: t.id, version: t.version, subject: t.subject, preview_text: t.preview_text,
          html: t.html, text_content: t.text_content, sender_name: t.sender_name, sender_email: t.sender_email,
          reply_to: t.reply_to, change_summary: `Rolled back to version ${version}`, created_by: who,
        });
      }

      const { error } = await db.from("email_templates").update({
        subject: v.subject, preview_text: v.preview_text, html: v.html, text_content: v.text_content,
        sender_name: v.sender_name, sender_email: v.sender_email, reply_to: v.reply_to,
        version: (t.version || 1) + (t.status === "published" ? 1 : 0),
        status: t.status === "published" ? "published" : t.status,
        updated_by: who,
      }).eq("id", t.id);
      if (error) return out({ ok: false, error: error.message }, 500);

      return out({ ok: true, rolledBackTo: version, message: `Restored version ${version}.` });
    }

    // -----------------------------------------------------------------------
    // PREVIEW — render with sample or custom variables (no sending)
    // -----------------------------------------------------------------------
    if (action === "preview") {
      const key = clean(body.key, 120);
      const vars = (body.vars && typeof body.vars === "object") ? body.vars : sampleVars(key);
      const { data: t } = await db.from("email_templates").select("*").eq("key", key).maybeSingle();
      const def = findTemplateDef(key);
      const source = t && t.status !== "archived" ? t : (def ? def.render(def.samples) : null);
      if (!source) return out({ ok: false, error: "Nothing to preview" }, 404);

      const merged = { ...sampleVars(key), ...vars };
      const html = renderVars((source as any).html, merged);
      const unresolved = extractVars(`${(source as any).subject}\n${(source as any).html}`).filter((v) => !(v in merged));
      return out({
        ok: true,
        subject: renderVars((source as any).subject, merged),
        previewText: renderVars((source as any).preview_text || "", merged),
        html,
        text: (source as any).text_content ? renderVars((source as any).text_content, merged) : htmlToText(html),
        unresolvedVars: unresolved,
      });
    }

    // -----------------------------------------------------------------------
    // TEST SEND — internal addresses only, [TEST] subject prefix
    // -----------------------------------------------------------------------
    if (action === "test_send") {
      const key = clean(body.key, 120);
      const to = clean(body.to, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return out({ ok: false, error: "Valid test address required" }, 400);
      // External recipients are never permitted; notifications@getassistara.com is always permitted.
      if (!TEST_INTERNAL.includes(to)) {
        return out({ ok: false, error: "Test sends are limited to internal addresses." }, 403);
      }

      const vars = { ...sampleVars(key), ...((body.vars && typeof body.vars === "object") ? body.vars : {}) };
      const def = findTemplateDef(key);
      const { data: t } = await db.from("email_templates").select("*").eq("key", key).maybeSingle();

      // Send the DRAFT when it exists, otherwise the published template.
      const usingDraft = t && t.status === "draft";
      const source = usingDraft ? t : (t && t.status === "published" ? t : def ? def.render(def.samples) : null);
      if (!source) return out({ ok: false, error: "Nothing to send" }, 404);

      const subject = renderVars((source as any).subject, vars);
      const html = renderVars((source as any).html, vars);
      const text = (source as any).text_content ? renderVars((source as any).text_content, vars) : htmlToText(html);

      const delivery = await createEmailDelivery(`template-test-${Date.now()}`);
      const result = await delivery.send({
        idempotencyKey: `template-test:${key}:${Date.now()}`,
        emailType: "template_test",
        to,
        subject: `[TEST] ${subject}`,
        html,
        text,
        replyTo: (source as any).reply_to || "academy@getassistara.com",
        deadline: new Date(Date.now() + 60_000),
        campaignKey: "template_tests",
        forceProvider: ["resend", "brevo", "sender"].includes(String(body.provider)) ? String(body.provider) as any : undefined,
        metadata: { template_key: key, using_draft: usingDraft },
      });

      return out({
        ok: result.success,
        provider: result.provider,
        status: result.status,
        usingDraft: !!usingDraft,
        to,
        error: result.error ? String((result.error as Error).message || result.error) : undefined,
        message: result.success ? `Test sent to ${to}. No subscriber was emailed.` : "Test send failed",
      });
    }

    // -----------------------------------------------------------------------
    // IMPORT — create a DRAFT for every registry template (no live change)
    // -----------------------------------------------------------------------
    if (action === "import") {
      let created = 0, updated = 0;
      const only = Array.isArray(body.keys) && body.keys.length ? body.keys.map(String) : TEMPLATES.map((t) => t.key);
      for (const key of only) {
        const def = findTemplateDef(key);
        if (!def) continue;
        const built = def.render(def.samples);
        const { data: existing } = await db.from("email_templates").select("id,status").eq("key", key).maybeSingle();

        const patch = {
          name: def.name,
          category: def.category,
          subject: built.subject,
          preview_text: def.previewText,
          html: built.html,
          text_content: built.text || htmlToText(built.html),
          sender_name: built.senderName || null,
          sender_email: built.senderEmail || null,
          reply_to: built.replyTo || null,
          is_critical: def.isCritical,
          updated_by: who,
        };

        if (existing?.id) {
          // Never overwrite a published template on import.
          if (existing.status === "published") { updated++; continue; }
          await db.from("email_templates").update({ ...patch, status: "draft" }).eq("id", existing.id);
          await db.from("email_template_variables").delete().eq("template_id", existing.id);
          await db.from("email_template_variables").insert(def.vars.map((v, i) => ({
            template_id: existing.id, name: v.name, label: v.label, description: v.description,
            type: v.type, required: v.required, sample_value: v.sample,
            source_hint: v.dynamic ? "generated per send" : "", sort_order: i,
          })));
          updated++;
        } else {
          const { data: row } = await db.from("email_templates").insert({
            key, ...patch, status: "draft", version: 1, created_by: who,
          }).select("id").maybeSingle();
          if (row?.id) {
            await db.from("email_template_variables").insert(def.vars.map((v, i) => ({
              template_id: row.id, name: v.name, label: v.label, description: v.description,
              type: v.type, required: v.required, sample_value: v.sample,
              source_hint: v.dynamic ? "generated per send" : "", sort_order: i,
            })));
          }
          created++;
        }
      }

      return out({
        ok: true, created, updated, total: TEMPLATES.length,
        message: `Imported ${TEMPLATES.length} templates as drafts. Nothing is live until you publish each one.`,
      });
    }

    // -----------------------------------------------------------------------
    // ARCHIVE / DELETE / DUPLICATE
    // -----------------------------------------------------------------------
    if (action === "archive") {
      const key = clean(body.key, 120);
      const { data: t } = await db.from("email_templates").select("id,is_critical,status").eq("key", key).maybeSingle();
      if (!t) return out({ ok: false, error: "Template not found" }, 404);
      if (t.is_critical && body.confirm !== true) {
        return out({ ok: false, error: "This is a critical transactional template — confirm to archive.", requireConfirmation: true }, 409);
      }
      const { error } = await db.from("email_templates").update({ status: "archived", updated_by: who }).eq("id", t.id);
      if (error) return out({ ok: false, error: error.message }, 500);
      return out({ ok: true, message: "Archived. Senders fall back to their built-in template." });
    }

    if (action === "delete") {
      const key = clean(body.key, 120);
      const { data: t } = await db.from("email_templates").select("id,is_critical,name").eq("key", key).maybeSingle();
      if (!t) return out({ ok: false, error: "Template not found" }, 404);
      if (!body.confirm || clean(body.confirm_text, 80).toLowerCase() !== "delete") {
        return out({ ok: false, error: `Type "delete" to permanently remove "${t.name}".`, requireConfirmation: true }, 409);
      }
      if (t.is_critical && body.confirm_critical !== true) {
        return out({ ok: false, error: "This is a critical transactional template — confirm again to delete.", requireConfirmation: true }, 409);
      }
      const { error } = await db.from("email_templates").delete().eq("id", t.id);
      if (error) return out({ ok: false, error: error.message }, 500);
      return out({ ok: true, message: "Template deleted. Senders fall back to their built-in template." });
    }

    if (action === "duplicate") {
      const key = clean(body.key, 120);
      const newKey = clean(body.new_key, 120);
      const { data: t } = await db.from("email_templates").select("*").eq("key", key).maybeSingle();
      if (!t) return out({ ok: false, error: "Template not found" }, 404);
      if (!/^[a-z0-9_]+$/.test(newKey)) return out({ ok: false, error: "New key must be lowercase letters, numbers and underscores." }, 400);
      const { data: clash } = await db.from("email_templates").select("id").eq("key", newKey).maybeSingle();
      if (clash) return out({ ok: false, error: "That key already exists." }, 409);
      const { data: row, error } = await db.from("email_templates").insert({
        key: newKey, name: `${t.name} (copy)`, category: t.category, subject: t.subject,
        preview_text: t.preview_text, html: t.html, text_content: t.text_content,
        sender_name: t.sender_name, sender_email: t.sender_email, reply_to: t.reply_to,
        status: "draft", is_critical: false, version: 1, created_by: who,
      }).select("id").maybeSingle();
      if (error) return out({ ok: false, error: error.message }, 500);
      if (row) {
        const { data: vars } = await db.from("email_template_variables").select("*").eq("template_id", t.id);
        if (vars && vars.length) {
          await db.from("email_template_variables").insert(vars.map((v: any) => ({
            template_id: row.id, name: v.name, label: v.label, description: v.description,
            type: v.type, required: v.required, sample_value: v.sample_value, source_hint: v.source_hint, sort_order: v.sort_order,
          })));
        }
      }
      return out({ ok: true, key: newKey, message: `Duplicated as "${newKey}" (draft).` });
    }

    return out({ ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    return out({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
