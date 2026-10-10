// ----------------------------------------------------------------------------
// Canonical Assistara branded email shell (SHARED — reuse, do not duplicate).
//
// This mirrors the deployed branded design used by:
//   - supabase/functions/website-form/index.ts        -> frame()
//   - supabase/functions/admin-applications/index.ts  -> shell()
//   - supabase/functions/admin-send-onboarding/index.ts -> shell()
//   - supabase/functions/payment-complete/index.ts    -> shell()/logo
//
// Brand tokens:
//   page background #f4f3ef · card #fff (border #e2dfd7, radius 24px, max-width 600px)
//   header #171717 · brand mark: yellow #FFD51F rounded square, "A", 42x42 r12
//   wordmark #fff 23px bold · heading h1 32px · body 16px/1.65 #4f4b45
//   CTA: bg #ffd51f, text #151515, radius 999px, padding 15px 21px, weight 700
//   footer: border-top #ece9e2, 12px #77716a
// Font: Arial (email-safe). No remote images (email-safe brand mark only).
// ----------------------------------------------------------------------------

export function brandEsc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export interface BrandEmailOptions {
  heading?: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  afterHtml?: string; // content rendered after the CTA button
  footerHtml?: string;
  showFallbackUrl?: boolean; // show the "copy this link" fallback under the CTA
}

export function brandedEmail(opts: BrandEmailOptions): string {
  const { heading, bodyHtml, cta, afterHtml, footerHtml } = opts;
  const showFallback = opts.showFallbackUrl !== false;
  const bodyPad = heading ? "0 32px 20px" : "34px 32px 20px";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#151515">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2dfd7;border-radius:24px;overflow:hidden">
<tr><td style="background:#171717;padding:20px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:#FFD51F;border-radius:12px;color:#151515;font-family:Arial,sans-serif;font-size:27px;font-weight:900;line-height:42px">A</td>
<td style="padding-left:12px"><b style="color:#fff;font-size:23px">Assistara</b></td>
</tr></table></td></tr>
${heading ? `<tr><td style="padding:34px 32px 12px"><h1 style="margin:0;font-size:32px;line-height:1.15">${brandEsc(heading)}</h1></td></tr>` : ""}
<tr><td style="padding:${bodyPad};font-size:16px;line-height:1.65;color:#4f4b45">${bodyHtml}</td></tr>
${cta ? `<tr><td style="padding:8px 32px 12px"><a href="${brandEsc(cta.href)}" style="display:inline-block;background:#ffd51f;color:#151515;text-decoration:none;font-weight:700;padding:15px 21px;border-radius:999px">${brandEsc(cta.label)}</a></td></tr>${showFallback ? `<tr><td style="padding:0 32px 28px;color:#77716a;font-size:12px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br><a href="${brandEsc(cta.href)}" style="color:#4f4b45;word-break:break-all">${brandEsc(cta.href)}</a></td></tr>` : ""}` : ""}
${afterHtml ? `<tr><td style="padding:0 32px 24px;font-size:16px;line-height:1.65;color:#4f4b45">${afterHtml}</td></tr>` : ""}
<tr><td style="border-top:1px solid #ece9e2;padding:20px 32px;color:#77716a;font-size:12px;line-height:1.6">${footerHtml ?? "Assistara<br>www.getassistara.com"}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface BrandTextOptions {
  heading?: string;
  lines: string[];
  cta?: { label: string; href: string };
  afterLines?: string[];
  footerLines?: string[];
}

export function brandedText(opts: BrandTextOptions): string {
  const out: string[] = [];
  if (opts.heading) out.push(opts.heading);
  out.push(...opts.lines);
  if (opts.cta) out.push(`${opts.cta.label}: ${opts.cta.href}`);
  if (opts.afterLines) out.push(...opts.afterLines);
  out.push("Assistara — www.getassistara.com");
  if (opts.footerLines) out.push(...opts.footerLines);
  return out.join("\n\n");
}