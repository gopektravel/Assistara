import { TEMPLATES } from "./supabase/functions/_shared/email-template-registry.ts";
for (const [key, t] of Object.entries(TEMPLATES)) {
  if (key.includes("academy_application_confirmation")) {
    const html = t.render({ student: { firstName: "Alex", lastName: "Rivera" } });
    console.log("=== " + key + " ===");
    console.log(html.substring(0, 2000));
  }
}
