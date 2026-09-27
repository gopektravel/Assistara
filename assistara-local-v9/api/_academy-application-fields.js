"use strict";

// The applicant's questionnaire on the live Assistara Academy application
// form, and nothing else.
//
// academy-apply.html is a static form with no client-side schema: every answer
// is sent as its own key and the website-form Edge Function writes it to its own
// column on public.academy_applications. This module is the single place that
// describes those applicant-facing answers, in the same order the applicant sees
// them on the form, and it is the explicit allowlist the Admin reads through.
//
// This is a closed list on purpose. A column added to the database later is NOT
// an applicant answer and must not appear in an application review, so adding a
// question to the form means deliberately adding it here as well.
//
//   form control             wire key            stored column
//   -----------------------  ------------------  -------------------------
//   select#situation         current_situation   current_situation
//   textarea#goal            why_remote_work     why_remote_work
//   textarea#tried           what_tried          what_tried
//   textarea#obstacle        biggest_obstacle    biggest_obstacle
//   input#direction          remote_work_interest remote_work_interest
//   radio[name=commitment]   weekly_commitment   weekly_commitment
//   radio[paymentReadiness]  payment_readiness   payment_readiness
//
// Full name and email are not listed: the card header already shows them.
//
// `long: true` marks a free-text answer that reads better on a full-width row.
// `options` maps a stored machine value to the exact label the applicant saw on
// the form, so a review reads as prose instead of a storage token. A value the
// form no longer offers is shown exactly as stored, because it is still the
// answer the applicant gave.

const APPLICATION_FIELDS = [
  {
    field: "current_situation",
    label: "What best describes your current situation?",
  },
  {
    field: "why_remote_work",
    label: "Why do you want to start working remotely?",
    long: true,
  },
  {
    field: "what_tried",
    label: "What have you already tried to get a remote job or client?",
    long: true,
  },
  {
    field: "biggest_obstacle",
    label: "What is your biggest obstacle right now?",
    long: true,
  },
  {
    field: "remote_work_interest",
    label: "What type of remote work interests you most?",
  },
  {
    field: "weekly_commitment",
    label:
      "Can you commit consistent time every week to complete the Academy and take action?",
  },
  {
    field: "payment_readiness",
    label: "If selected, would you be ready to join at \u20B16,900?",
    // The radio's stored value is a storage token; the applicant saw the
    // sentence next to it. Store the sentence, show the sentence. Punctuation
    // matches the form exactly, including its typographic apostrophe.
    options: {
      "Willing to invest in myself": "Yes, I\u2019m willing to invest in myself.",
      "Need payment plan": "I\u2019m ready to join, but I would need a payment plan.",
    },
  },
];

// The stored columns this allowlist is allowed to read, in form order.
const APPLICATION_FIELDS_BY_NAME = Object.freeze(
  APPLICATION_FIELDS.map(field => field.field),
);

module.exports = {
  APPLICATION_FIELDS,
  APPLICATION_FIELDS_BY_NAME,
};
