"use strict";

// Canonical description of the live Assistara Academy application form.
//
// `academy-apply.html` is a static form with no client-side schema, and the
// website-form Edge Function writes each answer to its own column on
// public.academy_applications. This module is the single place that maps those
// stored columns to the exact question wording shown to applicants, so the
// Admin never re-invents or re-types the questions.
//
// Verified against the deployed form at /academy/apply and the live
// academy_applications schema (2026-09-27).
//
//   form control            question id on the wire      stored column
//   ---------------------   -------------------------   ------------------------------
//   input#situation         current_situation            current_situation
//   textarea#goal           why_remote_work              why_remote_work
//   textarea#tried          what_tried                   what_tried
//   textarea#obstacle       biggest_obstacle             biggest_obstacle
//   input#direction         remote_work_interest         remote_work_interest
//   radio[name=commitment]  weekly_commitment            weekly_commitment
//   radio[paymentReadiness] payment_readiness             payment_readiness
//
// `group: "answers"` is the applicant's questionnaire. `group: "details"` is
// stored review metadata that is only rendered when it has a value.
// `long: true` marks free-text answers that read better on a full-width row.

const APPLICATION_FIELDS = [
  {
    field: "current_situation",
    label: "What best describes your current situation?",
    group: "answers",
  },
  {
    field: "why_remote_work",
    label: "Why do you want to start working remotely?",
    group: "answers",
    long: true,
  },
  {
    field: "what_tried",
    label: "What have you already tried to get a remote job or client?",
    group: "answers",
    long: true,
  },
  {
    field: "biggest_obstacle",
    label: "What is your biggest obstacle right now?",
    group: "answers",
    long: true,
  },
  {
    field: "remote_work_interest",
    label: "What type of remote work interests you most?",
    group: "answers",
  },
  {
    field: "weekly_commitment",
    label: "Can you commit consistent time every week to complete the Academy and take action?",
    group: "answers",
  },
  {
    field: "payment_readiness",
    label: "If selected, would you be ready to join at \u20B16,900?",
    group: "answers",
  },
  {
    field: "created_at",
    label: "Application submitted",
    group: "details",
    format: "datetime",
  },
  {
    field: "source",
    label: "Application source",
    group: "details",
  },
  {
    field: "tracking_token",
    label: "Tracking / referral code",
    group: "details",
  },
  {
    field: "reviewed_at",
    label: "Reviewed at",
    group: "details",
    format: "datetime",
  },
  {
    field: "notes",
    label: "Application notes",
    group: "details",
    long: true,
  },
  {
    field: "admin_notes",
    label: "Admin notes",
    group: "details",
    long: true,
  },
];

// Columns that Admin already presents through badges, buttons, or the card
// header. They are never repeated inside the answers panel.
const SYSTEM_FIELDS = [
  "id",
  "name",
  "email",
  "contact_id",
  "status",
  "decision",
  "accepted_at",
  "declined_at",
  "payment_status",
  "payment_method",
  "payment_amount",
  "currency",
  "promo_code",
  "receipt_number",
  "gcash_reference",
  "gcash_submitted_at",
  "gcash_followup_status",
  "gcash_approved_at",
  "auth_user_id",
  "onboarding_completed_at",
  "suspended_at",
  "acquisition_visit_id",
  "acquisition_visitor_id",
];

const CANONICAL_FIELDS = APPLICATION_FIELDS.map(field => field.field);

function humanizeField(field) {
  const words = String(field || "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return String(field || "");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

module.exports = {
  APPLICATION_FIELDS,
  SYSTEM_FIELDS,
  CANONICAL_FIELDS,
  humanizeField,
};
