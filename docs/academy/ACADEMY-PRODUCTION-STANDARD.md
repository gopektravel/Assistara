# Assistara Academy — Production Standard

**Status:** Binding production standard
**Applies to:** every Academy build, remediation, and QA pass
**Canonical implementation:** `assistara-local-v9/academy-dashboard.html`
**State of record:** `docs/academy/PRODUCTION-MANIFEST.md`
**Effective:** 2026-09-25

This is the single binding entry point for Academy production. It owns the production unit, the required pipeline, the gate definitions, the evidence rules, the queue rules, and the report format. It does not restate the delegated design standards; it binds them and resolves conflicts between them.

## 1. Authority and precedence

Read in this order. Later rows never override earlier rows.

| Order | Document | Owns |
| --- | --- | --- |
| 1 | `docs/academy/ACADEMY-PRODUCTION-STANDARD.md` | Production unit, pipeline, gates, evidence, queue rules, report format |
| 2 | `docs/academy/LESSON-SYSTEM.md` | Canonical lesson design and production standard |
| 3 | `docs/academy/VISUAL-LESSON-STANDARD.md` | Binding visual lesson and remediation standard |
| 4 | `assistara-local-v9/academy/LESSON_SLIDE_PRODUCTION_STANDARD.md` | Binding slide artifact, art direction, and slide QA gate |
| 5 | `docs/academy/PRODUCTION-MANIFEST.md` | Curriculum inventory, queue position, per-class QA evidence |
| 6 | Drive `Assistara Academy — Lesson Production Standard v2.docx` | Historical reference only; superseded where it conflicts |

### Resolved conflicts

| Conflict | Older source | Binding rule |
| --- | --- | --- |
| Quick Check size | Drive v2 suggests 3–5 questions | No fixed count. Use the smallest source-grounded assessment that gives meaningful evidence (`LESSON-SYSTEM.md` §3). |
| Canonical slide reference | Drive v2 names Phase 1 → Module 1 → Class 1 | Phase 1 → Module 3 → Class 1, Google Workspace Navigation, is the canonical art-direction reference (`LESSON_SLIDE_PRODUCTION_STANDARD.md`). |
| Slide artifact format | Drive v2 workflow is PPTX-era | One landscape 16:9 PDF per class. PDF is the master and learner artifact. PPTX is not the Academy default. |
| Production unit | Historical class-at-a-time queue | One complete module per batch (see §3). |

When two in-repo standards conflict, the more specific binding standard wins: slide standards govern slides, the visual standard governs learner-facing visual teaching, and this document governs workflow and gates.

## 2. Non-negotiables

- Never invent, renumber, reorder, or rename a class to make a source section fit.
- Never expose internal terminology such as "guidebook", "source PDF", "source material", prompt text, class keys, or production/QA notes in learner-facing copy.
- Never claim a gate passed unless it was actually performed. Record the exact limitation instead.
- Never start a new module batch while the active batch has an unresolved defect.
- Never add resources, exercises, templates, checklists, or skill mappings to appear complete.
- Never reuse a reference deck's compositions. Reuse the visual language, not its layouts.

## 3. Production unit: one module batch

A production batch is one complete module from the current curriculum. The batch is researched, planned, built, connected, and verified as a unit so shared language, examples, visual treatment, progression, and QA stay coherent.

The batch record in the manifest must state:

- Phase ID and title.
- Module ID and title.
- Every class ID, title, source lesson, and current state.
- The reference class used for in-module consistency.
- Batch decisions and unresolved questions.
- Gate evidence per class and per batch.
- The single next authorized target.

Only one batch may be active at a time.

## 4. Required pipeline

Run in this order. Each step records its own evidence in the manifest.

| # | Step | Requirement |
| --- | --- | --- |
| 1 | Source research | Read the complete approved source section for every class in the module. Record file, lesson number, and page range. |
| 2 | Content plan | Write the module plan and a per-class plan before any implementation. |
| 3 | Build all classes in the module | Implement every class in the batch to the implementation contract in §6. |
| 4 | Create/connect slides | Produce one landscape 16:9 PDF per class and connect it to the Lesson Slides action. |
| 5 | Create Quick Checks | Build the source-grounded assessment and completion path for every class. |
| 6 | Connect resources | Add only justified optional resources, connected and verified. |
| 7 | Connect completion | Wire `markClassComplete` for every class in the batch. |
| 8 | Verify progression | Confirm class, module, phase, and exam gating, including the final class in the module. |
| 9 | Content QA | Independent re-read of source against implementation. |
| 10 | Functional QA | Exercise opening, video state, lesson render, slides, Quick Check, retry, completion, persistence, and unlock. |
| 11 | Visual QA | Render and inspect every slide page, then inspect the learner-facing class. |
| 12 | Mobile QA | Inspect at approximately 375px, 390px, and 430px, including the slide lightbox. |
| 13 | Final module report | Publish the report in §10. |

A batch is not complete because some classes are built. It is complete when every class in the batch passes every applicable gate.

## 5. Source research and content plan

### Authority

- Phase, module, class identity, class order, and unlock order come from the current curriculum: the `curriculum` array in `assistara-local-v9/academy-dashboard.html`, cross-checked against the manifest inventory.
- Teaching content, examples, and terminology come from the original Phase 1–4 AI-Powered VA Guidebooks in Drive under `Original Course Material`.
- Guidebook numbering contains gaps, duplicates, and inconsistent labels. Never derive class IDs or order from guidebook numbering; use it to locate source content only.

### Research record

For each class record:

- Source file, lesson number, and page range.
- Central teaching objective.
- Concepts that must be taught.
- Source-provided examples, workflows, warnings, and free alternatives.
- Points where the source is dated, Pro-only, or otherwise conditional; teach them accurately rather than silently upgrading them.
- Claims that require current external verification.

### Plan record

Per class:

- Learner starting point and outcome.
- Teaching beats in source order.
- Source-grounded example or scenario.
- Misconception or failure mode addressed.
- Slide teaching story and why each page earns its place.
- Quick Check evidence required.
- Optional resources and skills, each with a justification or an explicit "none".

Per module:

- Shared vocabulary and dependencies.
- Progression path across the classes.
- The module outcome and the state that follows final-class completion.

## 6. Implementation contract

The canonical learner application is `assistara-local-v9/academy-dashboard.html`, a single inline script. A built class must satisfy all of the following.

### Identity and routing

- Class identity comes from `key(pi,mi,ci)` → `p{phase}m{module}c{class}` and from the `curriculum` entry.
- The class is dispatched explicitly from `openClass`. Unbuilt classes must not fall through to built content.
- The lesson header shows the correct `PHASE → MODULE → CLASS n OF m` eyebrow and title.

### Lesson metadata and state

- A `lessonNN` metadata object with `key`, `title`, `description`, `objectives`, `questions`, and `slidesFileId`.
- A `renderLessonNN` function with its own transient selection/submitted state that resets when the class is already completed.
- Handlers for back navigation, slide preview, answer selection, Check Answers, retry, completion, and continue.

### Quick Check behavior

- All required answers must be entered before Check Answers activates.
- Submission shows explanatory feedback for every question.
- Correct responses lock; incorrect responses remain retryable.
- A changed wrong answer resets the submitted state.
- Full pass exposes Complete Class.
- Question count is content-driven and justified in the plan. Do not add interaction types for variety.

#### Binding wrong-answer rule

This rule is binding on every Quick Check and assessment in Phases 1–4. It corrects the earlier behavior that marked the chosen option as wrong and reused the correct-answer rationale as the explanation.

When a learner submits an incorrect answer:

1. The result is made clear in the feedback message, not by marking up the options.
2. Feedback opens with a short, human, varied acknowledgment. Rotate openers; never repeat one robotic line for every wrong answer.
3. Feedback then explains, in one or two sentences, why the specific option the learner selected does not work. Speak to that option, not to the lesson.
4. Feedback must never reveal, name, mark, highlight, or strongly hint at the correct answer. Do not reuse the correct-answer rationale (`why`) and do not point at an option.
5. Every answer option stays visually neutral. Do not add a `wrong` class, do not add `correct` to the unselected correct option, and do not lock the options.
6. The attempt must remain retryable, and the feedback should invite another try.

Established behavior that does not change:

- A correct answer still shows positive feedback built from the correct-answer rationale.
- A correct answer may still be marked and locked after a correct submission.
- The all-answers-before-Check-Answers gate, retry, completion, persistence, and unlock behavior are unchanged.

Implementation requirements:

- All assessment feedback goes through the centralized `qcFeedback(q, ok, sel)` helper. Do not inline feedback strings in a renderer.
- `qcWrongExplanation(q, sel)` reads `q.whyWrong[sel]` and must never read `q.why`. Classes without authored `whyWrong` copy fall back to a neutral, friendly prompt that invites another try and gives nothing away.
- Author `whyWrong` for every incorrect option of every question in a class. A class is not content-complete while any of its incorrect options falls back.
- Validate with `node scripts/validate_quick_checks.js` before shipping a class.

Acceptance check, run against the real class in a browser for every incorrect option:

1. The incorrect option produces a result.
2. The result is clearly communicated as incorrect.
3. The explanation is useful and specific to the selected option.
4. No option is revealed, named, marked, or hinted at.
5. The explanation is not obvious and does not simply restate the question.
6. The learner can retry.
7. The correct answer still works and still shows positive feedback.
8. Completion and progression still work.

### Completion and progression

- Completion calls the centralized `markClassComplete`, which upserts `academy_class_progress` on `(user_id, class_key)`.
- Completion persists across refresh and reopening; reopening a completed class renders the saved completion state.
- Completing a class unlocks only the next class in curriculum order (`isClassUnlocked`).
- Completing the final class in a module unlocks the next module (`isModuleUnlocked` / `isModuleComplete`) and must not claim later unbuilt content is available.
- Reopening a completed class must not expose stale quiz state.

### Video

- Use the established intentional "Lesson video coming soon" 16:9 state until a real video exists. Never fake a playable video or invent a URL.

### Slides

- One landscape 16:9 PDF per class, named `Assistara_Academy_P{phase}_M{module}_C{class}_{Class_Name}_Lesson_Slides.pdf`.
- Connect through the shared Lesson Slides preview/download action with the correct file ID and filename.
- Follow `assistara-local-v9/academy/LESSON_SLIDE_PRODUCTION_STANDARD.md` for art direction and the visual standard for teaching composition.
- Store the master PDF in the class folder under Drive `Production Course Material`.

### Resources and skills

- Resources and skill mappings are never automatic. Add only when the source and learning outcome justify them, and record the justification.
- A skill milestone may only point at classes that genuinely develop or demonstrate that skill.

### Test Student Portal states

- Add a `current` and a `done` preview state per built class (for example `p2m1c2qa` and `p2m1c2done`), each completing all prerequisite phases and modules so the target class is legitimately reachable, and list both in the preview selector.
- This is required for verifiable functional QA, not optional polish.

### Responsive requirements

- Add class-scoped responsive hardening (for example a class-specific shell with `min-width` and stacking rules at narrow widths) rather than relying on desktop layout to shrink.
- Keep answer targets and slide controls at comfortable touch sizes.
- No horizontal overflow, clipped content, or squeezed desktop grids.

## 7. Gates

| Gate | Passes when |
| --- | --- |
| Content QA | Source re-read independently; every taught concept present; no invented curriculum claims; no internal terminology; Quick Check tests only taught material; difficulty appropriate. |
| Visual QA (slides) | Every PDF page rendered and visually inspected at full size and phone size; no clipping, overflow, collisions, weak hierarchy, or template repetition; real logo lockup correct; Manrope embedded. |
| Visual QA (class) | The learner-facing class looks taught, not merely written; important concepts are shown; no card-wall or wall-of-text sections; composition varies with meaning. |
| Functional QA | Identity/opening, video state, written lesson, slide preview/download, resources, Quick Check selection/grading/retry/pass, the binding wrong-answer rule, completion, persistence, reopen, unlock, module/phase gating, skills, portal states, and shared navigation verified. |
| Progression QA | Every class in the module connects in order; the final class produces the correct module state; no class skips a prerequisite; completion state survives navigation. |
| Mobile QA | Approximately 375px, 390px, 430px inspected: headings, cards, answers, feedback, buttons, progress, video, completion, resource controls, slide lightbox, overflow, and long-text wrapping. |
| Live QA | Only when a deployed environment was actually exercised. If deployment access is unavailable, record the gate as not verified, never as passed. |

Required manifest QA keys per class:

`visual_lesson_standard_read`, `meaningful_visual_teaching_checked`, `repeated_card_wall_of_text_checked`, `source_read`, `written_lesson`, `slides_created`, `slides_rendered_visual_QA`, `slide_preview_download_tested`, `quick_check_tested`, `wrong_answer_tested`, `wrong_answer_retry_tested`, `completion_persistence_tested`, `next_unlock_tested`, `desktop_tested`, `mobile_tested`, `live_production_tested`, `known_issues`.

`wrong_answer_tested` means every incorrect option in the class was exercised in a real browser and produced a friendly, varied, option-specific explanation that revealed nothing and left every option neutral.

## 8. Status semantics

- `LIVE + VERIFIED`: learner-facing production directly tested end-to-end after deployment.
- `BUILT + FINAL LOCAL QA`: implementation, content, and assets passed all locally verifiable final gates, while explicitly listed external or live gates remain unverified.
- `LIVE BUT NEEDS QA`: implementation/assets exist but final QA is incomplete.
- `PARTIALLY BUILT`: some implementation/assets exist but the class is not ready.
- `NOT BUILT`: no class implementation found.

`BUILT + FINAL LOCAL QA` is a valid terminal state for a class. The batch/module may only be reported complete with its live limitations listed explicitly.

## 9. Definition of done

### Class

1. Identity, order, and source match the curriculum and manifest.
2. Written lesson, video state, slides, Quick Check, resources, completion, and progression are connected and tested.
3. Content, visual, functional, progression, and mobile gates have recorded evidence.
4. The learner can complete the class and reach the correct next state.
5. No known fixable defect remains, and every unperformed external check is recorded as unverified.

### Module batch

1. Every class in the module meets the class definition.
2. The module-level progression, shared language, and final-class state are verified.
3. The final module report is published with live limitations stated.

## 10. Final module report format

Every completed batch publishes a report with exactly these sections:

1. `PHASE 1 REFERENCE`
2. `BINDING STANDARD`
3. `PHASE 2 MAP`
4. `NEXT PRODUCTION BATCH`
5. `RISKS / MISSING INFORMATION`
6. `READY STATUS`

`READY STATUS` must be exactly one of:

- `READY TO BUILD PHASE 2 MODULE 1`
- `BLOCKED — [specific reason]`

## 11. Queue rules

- One active module batch at a time; the manifest names it explicitly.
- A batch entry does not authorize building the next batch. Advancing the queue is a manifest-only action after the current batch's final gate.
- Advance the queue only in the manifest, never by silently building the next class.
- Record environment blockers (deployment authorization, missing Drive hydration, unavailable tooling) in the manifest with the exact cause and its effect on gates.
- Existing-class remediation and new-phase building are separate batches. The Academy-wide visual remediation directive remains an open obligation; a new-phase batch does not satisfy it.

## 12. Phase 2 map (verified against implementation and manifest)

Curriculum identity source: `curriculum` array in `assistara-local-v9/academy-dashboard.html`. Phase 2 Module 1 is titled **Build Your VA Brand** and contains four classes.

| Class key | Class title | Source lesson | Implementation state |
| --- | --- | --- | --- |
| p2m1c1 | Canva Navigation: Colors, Elements & Fonts | Phase 2 guidebook, Module 1, Lesson 1.2 | BUILT + FINAL LOCAL QA (`renderLesson23`, learner PDF connected) |
| p2m1c2 | Create Your Profile Picture | Lesson 1.3 | NOT BUILT — no dispatch, no metadata, no slides, no portal states |
| p2m1c3 | Create Your Facebook & LinkedIn Cover | Lesson 1.4 | NOT BUILT |
| p2m1c4 | Create Your Email Signature | Lesson 1.5 | NOT BUILT |

Remaining Phase 2 modules, all NOT BUILT, from the manifest inventory:

| Module | Title | Classes |
| --- | --- | --- |
| M2 | Canva Design & Visual Branding | Brand strategy for clients; Create a logo; Brand kit & guidelines |
| M3 | Social Media Management | Intro to social media marketing; Set up a Facebook page; Meta Business Suite; Analytics & measurement |
| M4 | Content Planning & Workflow | AI content planning; ClickUp; Asana; Google Sheets |
| M5 | Social Media Content Design | Power of visuals; Engaging social media graphics |
| M6 | Video Editing | VA video introduction; Social media video editing |
| M7 | Meta Ads Fundamentals | Business Manager & ads; Business page; First campaign; Payment structure; Reading results |
| M8 | Influencer Marketing | Collaboration & sourcing; Finding influencers |
| M9 | Funnels & Lead Conversion | Landing pages & lead magnets; Sales page copywriting (clients); Sales page copywriting (VAs); High-converting funnel design |
| M10 | Email Marketing | Buy your own domain; First email marketing campaign |

## 13. Known risks and open decisions

- **Live verification blocked:** connected Vercel authorization exposes zero teams/projects, so deployed clicks, Drive preview/download responses, authenticated persistence, and physical device interaction cannot be verified. Affected classes stay below `LIVE + VERIFIED`.
- **Visual inspection limit:** programmatic geometry/palette/font gates do not replace human-eye page inspection. A human review is required before any future live promotion.
- **Open remediation:** Phase 1 Modules 1–4 remain `LIVE BUT NEEDS QA`; Phase 1 Module 5 is a known visual-remediation priority. The Academy-wide remediation directive is not satisfied by Phase 2 work.
- **Batch decision — Canva skill milestones:** the current Canva skill maps to `["p2m1c1","p2m2c1"]`. Decide and record whether p2m1c2–p2m1c4 genuinely develop that existing skill before wiring any milestone; do not auto-map.
- **Batch decision — final-class state:** p2m1c4 completion must mark Module 1 complete and unlock Module 2 while presenting Module 2 as unbuilt/coming soon.
- **Batch requirement — portal states:** p2m1c2/p2m1c3/p2m1c4 `current` and `done` preview states are required for verifiable functional QA.
- **Known cosmetic PDF issue:** copied text from learner PDFs can contain ligature-to-PUA codes. Pixels are correct; note it rather than re-encoding the artifact without cause.
- **Drive hydration:** some production binaries appear as online-only placeholders until accessed. Hydrate before relying on a file and record any gate that could not run.

## 14. Ready status

`READY TO BUILD PHASE 2 MODULE 1`

Batch scope: Phase 2 → Module 1 (Build Your VA Brand), remaining classes p2m1c2, p2m1c3, p2m1c4. p2m1c1 is the in-module reference and is not rebuilt. Live/deployed verification remains blocked and is tracked as a risk, not as a passed gate.
