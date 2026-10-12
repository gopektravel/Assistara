import { TEMPLATES } from "./supabase/functions/_shared/email-template-registry.ts";
const keys = [
  "academy_application_confirmation","internal_new_application",
  "academy_application_accepted","academy_application_waitlisted",
  "academy_onboarding","academy_payment_confirmation",
  "academy_waitlist_seat_opened","masterclass_reminder_24h",
  "masterclass_followup","masterclass_reminder_30","masterclass_reminder_5",
  "masterclass_registration_confirmation"
];
const arr = (TEMPLATES as any[]);
for (const k of keys) {
  const t = arr.find((x: any) => x && x.key === k);
  if (!t) { console.log("BLOCKED: " + k); continue; }
  const result = typeof t.render === "function" ? t.render({ student: { firstName: "A", lastName: "B", email: "a@b.com" }, course: { name: "C" }, event: { title: "D" }, seat: "E", confirming: true }) : null;
  if (!result || typeof result !== "object") { console.log("BLOCKED: " + k + " (bad render result)"); continue; }
  const html = result.html || "";
  const subject = result.subject || "";
  const text = result.text || "";
  const status = html.length > 500 ? "RECOVERED (html=" + html.length + ", subj=\"" + (subject || "?").substring(0, 40) + "\")" : "SHORT/PLACEHOLDER";
  console.log(k + " | " + status);
  await Deno.writeTextFile("recovered_" + k + ".html", html);
  await Deno.writeTextFile("recovered_" + k + ".subject.txt", subject);
  await Deno.writeTextFile("recovered_" + k + ".text.txt", text);
}
console.log("All recovered files written.");
