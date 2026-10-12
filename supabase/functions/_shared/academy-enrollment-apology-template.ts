import { brandedEmail, brandedText, brandEsc, para } from "./email-brand.ts";

export const ACADEMY_ENROLLMENT_APOLOGY_SUBJECT = "Oops! Your Assistara enrollment link is fixed 💛";

export function academyEnrollmentApologyTemplate(firstName: string, enrollmentUrl: string) {
  const first = brandEsc(firstName || "there");
  const html = brandedEmail({
    heading: "Your enrollment link is fixed 💛",
    bodyHtml:
      para(`Hey ${first}! 💛`) +
      para("Oops! We spotted a technical issue in our enrollment system that prevented some payments from going through.") +
      para("We've fixed it, and your place in Assistara Academy is still waiting for you! 🎉") +
      para("Here's your new enrollment link:", { last: true }),
    cta: { label: "👉 Complete My Enrollment", href: enrollmentUrl },
    afterHtml:
      para("Sorry for the little hiccup, and thank you for your patience!") +
      para("We can't wait to welcome you to the Academy! 💛") +
      para("The Assistara Team 💛", { last: true }),
  });
  const text = brandedText({
    heading: ACADEMY_ENROLLMENT_APOLOGY_SUBJECT,
    lines: [
      `Hey ${firstName || "there"}! 💛`,
      "Oops! We spotted a technical issue in our enrollment system that prevented some payments from going through.",
      "We've fixed it, and your place in Assistara Academy is still waiting for you! 🎉",
      "Here's your new enrollment link:",
    ],
    cta: { label: "👉 Complete My Enrollment", href: enrollmentUrl },
    afterLines: [
      "Sorry for the little hiccup, and thank you for your patience!",
      "We can't wait to welcome you to the Academy! 💛",
      "The Assistara Team 💛",
    ],
  });
  return { subject: ACADEMY_ENROLLMENT_APOLOGY_SUBJECT, html, text, senderName: "Assistara Academy" };
}
