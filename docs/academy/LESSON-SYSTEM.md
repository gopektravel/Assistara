# Assistara Academy — Canonical Lesson System

**Status:** Canonical production standard  
**Reference implementation:** Phase 1 → Module 1 → Class 1 — **What is Freelancing? What is Virtual Assistance?**  
**Reference UI:** `assistara-local-v9/academy-dashboard.html`

> Before changing the shared lesson system or building a new class, inspect the current Class 1 implementation. Archived/obsolete Class 1 assets are not references.

## 1. Academy hierarchy and progression

Academy → Phase → Module → Class.

Progression is sequential: class completion → module progression → phase completion → Phase Exam → next phase → Final Academy Exam → certificate.

A class must never bypass the existing phase/module/class gating.

## 2. Canonical teaching-class anatomy

A normal teaching class uses the same visual and interaction language as the reference Class 1 while allowing the teaching content to determine the number and type of sections.

**Identity:** phase, module, class number, title, concise description, completion state.

**Video:** standard 16:9 teaching-video area. Until recorded, use the established Coming Soon treatment.

**Written lesson:** structured sections beneath the video. Prefer meaningful explanations, examples, comparisons, diagrams, callouts, workflows, scenarios, and practical examples over walls of text. Do not force every class into the same number of sections.

**Lesson Slides:** normal teaching classes have a corresponding teaching deck. Use the established compact Lesson Slides trigger. It opens the existing lightbox with loading state, embedded preview, viewer masking, floating Download, and Close controls. Do not expose production/source folders.

**Quick Check:** required for a normal teaching class, normally 3–5 source-grounded questions/scenarios. All questions are visible; selecting does not grade immediately; Check Answers becomes available after required answers are selected; correct responses lock; incorrect responses remain retryable; Check Answers Again supports retry; full pass exposes Complete Class; completion persists and unlocks progression according to Academy rules.

## 3. Conditional elements — never add by habit

### Student Guide / Workbook / PDF
Optional. Create only when it materially helps the student execute a workflow, complete an exercise, use a checklist/template, retain reference information, or perform something outside the lesson. Do not create a PDF merely for consistency.

### Skill mapping
Optional. Map only when the class genuinely develops or demonstrates an existing Academy skill. Never attach arbitrary skills to populate My Skills. Skill lifecycle remains Locked → Available → Learning → Demonstrated → Verified. Skill Challenges are separate from class Quick Checks.

### Practical exercise
Optional. Add when practice materially improves learning. Introductory/conceptual classes do not need forced exercises.

### Templates / checklists / resources
Optional. Include only when they have practical value. Avoid resource clutter.

## 4. Teaching-slide system

Slides are the visual teaching counterpart of the lesson, not a transcript.

- 16:9
- Manrope only
- Assistara cream, near-black, Assistara yellow
- restrained peach/sage accents
- strong whitespace and large typography
- clean diagrams and visual storytelling
- minimal text
- one brand lockup per slide: **[Assistara logo] ASSISTARA ACADEMY**
- preserve the logo artwork, including the black internal A
- no repeated Assistara branding on a slide

Slide count follows the material. Class 1 has six slides; six is not a template requirement.

The written lesson carries detail. Slides teach visually. Do not paste lesson paragraphs into slides.

## 5. Source-material rule

Production workflow:

**approved source → learning objective → written lesson → teaching slides → Quick Check → justified optional resources/skills → QA**

Read the approved source before authoring. Assessment must test what the class actually teaches. Do not silently invent major curriculum claims. Internal terms such as “original guidebook,” “source PDF,” and “source material” must never appear in student-facing copy.

## 6. Future reusable lesson data contract

When the Academy renderer is extracted/refactored, future classes should primarily provide structured data rather than copied page markup:

- `classKey`
- phase/module/class identifiers
- title and description
- learning objectives
- lesson sections
- video state/source
- slides preview/download source
- Quick Check questions and feedback
- optional skill mappings
- optional resources
- optional practical exercise
- completion requirements

The shared renderer owns presentation and behavior. Do not perform a risky rewrite merely for abstraction; preserve working Class 1 behavior first.

## 7. Production workflow for every new class

### Before building
1. Identify exact phase/module/class.
2. Read approved source material.
3. Define the learning outcome.
4. Decide whether any existing Academy skills genuinely apply.
5. Decide whether supporting resources are genuinely useful.

### Build
1. Written lesson.
2. Teaching slides.
3. Quick Check.
4. Optional exercise/resources only when justified.
5. Skill mapping only when justified.

### QA
1. Content accuracy.
2. Lesson visual consistency.
3. Slides rendered and visually inspected.
4. Quick Check tested.
5. Completion persistence tested.
6. Next-class unlock tested.
7. Desktop tested.
8. Tablet tested.
9. Mobile tested.
10. Production deployment checked.

## 8. Before Shipping Any New Class

- [ ] Same Academy visual language and lesson hierarchy
- [ ] Manrope throughout
- [ ] Slide deck matches Academy design language
- [ ] One Assistara Academy lockup per slide
- [ ] Content grounded in approved source
- [ ] Quick Check tests taught material
- [ ] Optional resources exist only when useful
- [ ] Skills mapped only when justified
- [ ] Slides preview and download work
- [ ] Completion persistence works
- [ ] Progression/unlock works
- [ ] Desktop/tablet/mobile QA complete
- [ ] No internal/source terminology exposed to students

## 9. Scope guard

Class 1 is the reference implementation, not a mandate that every lesson have identical content, slide count, resources, skills, or exercises. Preserve the system; adapt the teaching package to what the lesson actually needs.
