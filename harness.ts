// Isolated harness to recover real email HTML from registry
import { TEMPLATES } from "./supabase/functions/_shared/email-template-registry.ts";
const keys = [
  "academy_application_confirmation","internal_new_application",
  "academy_application_accepted","academy_application_waitlisted",
  "academy_onboarding","academy_payment_confirmation",
  "academy_waitlist_seat_opened","masterclass_reminder_24h",
  "masterclass_followup","masterclass_reminder_30","masterclass_reminder_5",
  "masterclass_registration_confirmation"
];
for (const k of keys) {
  const arr = (TEMPLATES as any[]);
  const t = arr.find((x: any) => x && x.key === k);
  if (!t) { console.log(k + " => BLOCKED (missing from registry)"); continue; }
  let html = "";
  try {
    html = typeof t.render === "function" ? t.render({ student: { firstName: "A", lastName: "B", email: "a@b.com" }, course: { name: "C" }, event: { title: "D" }, seat: "E", confirming: true }) : "";
  } catch (e: any) { html = "ERROR: " + e.message; }
  console.log(k + " | source=registry.render | type=" + typeof html + " | keys=" + (typeof html === "object" && html !== null ? Object.keys(html).join(",") : "n/a"));
  // Write to file for DB import
  await Deno.writeTextFile("recovered_" + k + ".html", html);
}
