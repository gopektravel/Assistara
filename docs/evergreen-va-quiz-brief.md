# Assistara Evergreen VA Career Quiz — Implementation Brief

Status: APPROVED CONCEPT; NOT IMPLEMENTED OR DEPLOYED.

## Goal
Replace dependence on one-off masterclasses with an evergreen, mobile-first lead funnel. Inspired by the lifestyle-design and delegation ideas popularized by Tim Ferriss, but do not imply endorsement, quote book text, or promise four-hour workweeks or earnings.

## Funnel
Landing banner → /quiz → 7 questions → immediate short results preview → first name + email + separate unchecked marketing consent → complete personalized results email → segmented welcome emails → /academy/apply → verified checkout.

## Quiz headline
“What Kind of Virtual Assistant Could You Become?”
Subtitle: “Discover your strengths, explore remote career opportunities, and find your first step toward working from anywhere.”
CTA: “Discover My VA Type”
Time: ~2 minutes, 7 questions, free.

## Questions
1. Preferred activity: organization / content creation / customer communication / research.
2. Experience: complete beginner / transferable skills / studied VA work / existing clients.
3. Motivation: extra income / replace job / flexibility / long-term career.
4. Biggest obstacle: where to start / skills and confidence / finding clients / equipment.
5. Timeline: ASAP / within a month / 1–3 months / exploring.
6. Learning style: step-by-step / projects / live feedback / self-paced.
7. Needed support: roadmap / skills / portfolio / client acquisition.

## Results
Organizer (administrative and executive support), Creative (social media and content), Communicator (customer support and appointment setting), Researcher (research, data, operations). Primary archetype from question 1; do not pretend this is a validated psychometric assessment. Use remaining answers for personalization, intent scoring and recommended next steps.

## Lead capture
Show basic result before capture; offer detailed roadmap via email. Collect first name, email, quiz answers, attribution UTM/referrer, timestamp, consent version/time if opted in. Marketing consent must be separate, optional, unchecked, and honored. Link privacy policy. Never block access to a basic result based on marketing opt-in.

## Email automation
Transactional result email with detailed result and personalized roadmap. Optional marketing sequence ONLY to opted-in contacts: day 1 starting steps, day 3 practical example, day 5 common obstacle, day 7 Academy invitation. Use existing Resend gateway and template studio; avoid duplicate contacts and double sends; provide unsubscribe for marketing.

## Admin
In existing admin dashboard: quiz visitors, starts, completions, result distribution, captured leads, opt-in rate, applications, paid conversions, source/UTM, and email delivery events. Individual lead record includes answers and consent. Respect existing access controls.

## Technical requirements
Inspect existing application framework, routing, Supabase schema, auth/admin policies, Resend delivery gateway and tracking before implementing. Add schema migration with RLS and server-side validation, anti-bot/rate limits, idempotent upsert, and minimal PII retention. Do not introduce first-party tracking pixels or redirects. Mobile-first responsive, accessible keyboard controls, saved progress within session. Existing checkout must be independently tested before any paid traffic.

## Experiment
A/B test “What Kind of VA Could You Become?” against “Could You Become a Virtual Assistant?”. Primary KPI: paid customers per 100 quiz starters and cost per paying customer. Secondary: quiz completion, email capture, application, checkout completion. No invented performance claims.

## Acceptance
End-to-end test visitor → quiz → result → email → Academy application → successful discounted checkout → enrollment; test duplicate submissions, invalid email, consent/no-consent, mobile, accessibility, delivery failure, and admin visibility. Do not announce launch until verified on production.
