# Assistara Academy — Lesson Style & Production Guide

**Status:** Canonical production standard  
**Reference UI:** `assistara-local-v9/academy-dashboard.html`

> Classes 1–4 are examples of this system in use, not page templates. Inspect current implementations for quality and interaction behavior, then design each new class from its approved source and learning outcome.

## 1. Core principle

Academy → Phase → Module → Class. Progression remains sequential: class completion → module progression → phase completion → Phase Exam → next phase → Final Academy Exam → certificate.

Every Assistara Academy class is custom-designed around its learning outcome using a shared design system and reusable teaching components.

Design from the content outward:

**approved source → learning outcome → what the learner must understand/do → best teaching method → best lesson structure → best visual presentation → best knowledge check → responsive implementation → QA**

Never start with a template and force the material into it.

**Consistency** means shared brand, hierarchy, spacing, typography, navigation, feedback, progress behavior, accessibility and polish.

**Sameness** means repeating the same section count, cards, lesson length, slide count, question count, layout or interaction pattern. We want consistency, not sameness.

## 2. What stays consistent

- Assistara visual language: Manrope, cream, near-black, Assistara yellow, restrained sage/peach
- real approved Assistara logo only
- Phase → Module → Class context and clear completion state
- established Academy navigation and progression
- premium video area when the lesson has a teaching video; until recorded, use the intentional Coming Soon treatment
- written learning experience
- established compact Lesson Slides trigger and lightbox for normal teaching decks
- meaningful completion requirement
- progress persistence and sequential unlocking
- accessible interaction patterns and clear feedback
- polished desktop and mobile experience

These are family resemblance, not a fixed anatomy.

## 3. What is content-driven

### Lesson length and written structure
There is no target length or section count. Do not pad simple lessons or compress complex ones. A lesson may use explanations, comparisons, processes, frameworks, step-by-step workflows, scenarios, conversations, before/after examples, annotated screenshots, decision trees, checklists, interactive examples, mini case studies, demonstrations, tool walkthroughs, practice, or reflection. Use only what teaches the topic well. Do not force numbered sections.

### Slides
There is no target slide count. Three, five, seven, ten, twelve, or another count is valid when every slide earns its place. Slides are the visual teaching counterpart, not a transcript.

### Understanding / Quick Check
There is no fixed question count. Use the smallest source-grounded assessment that gives meaningful evidence of the important learning outcomes. Depending on the lesson, use multiple choice, scenarios, best-next-action, identify-the-mistake, stronger-response choices, ordering, matching, true/false when genuinely useful, mini workflow decisions, tool understanding, or a practical challenge. Do not add interaction types merely for variety.

When the existing Quick Check primitive is appropriate: all required items are visible; selecting does not grade immediately; Check Answers activates after required responses are complete; correct responses lock; incorrect responses remain retryable; full pass exposes Complete Class; completion persists and unlocks progression.

### Resources
Never automatic. Create a PDF, workbook, checklist, template, or other download only when the learner would genuinely benefit from using it outside the lesson.

### Skill mapping
Never automatic. Map only when a class genuinely develops or demonstrates an existing Academy skill. Never invent a skill merely to populate My Skills.

### Variation
Do not make lessons different merely to appear different. If the same component is genuinely the best teaching tool twice, reuse it.

## 4. Reusable building blocks, not a giant template

Reusable components are encouraged for:

- lesson identity/header
- video shell
- slide resource
- buttons
- assessment primitives
- progress UI
- feedback
- completion states

The content composition must remain flexible. Do not build one generic renderer that forces every lesson into the same anatomy.

## 5. Teaching-slide visual system

The deck follows the same content-first rule.

- 16:9
- Manrope only
- cream / near-black / Assistara yellow
- restrained peach/sage accents
- strong whitespace and large typography
- clean diagrams and visual storytelling
- minimal text
- one brand lockup per slide: **[REAL Assistara logo] ASSISTARA ACADEMY**
- use the approved logo from Brand Assets; never recreate, redraw, approximate, type, or simulate it
- preserve the black internal A
- no repeated Assistara branding on one slide

Choose layouts from the material: process diagrams, screenshots/UI callouts, comparisons, conversations, scenarios, data, frameworks, demonstrations, or other structures when they improve understanding.

**Deck workflow:** understand lesson → identify teaching ideas → choose the best visual representation → design a custom sequence in the Assistara visual language → render every slide → visually inspect → revise.

Never open a fixed deck and replace text.

## 6. Source-material rule

Production workflow:

**approved source → learning objective → teaching experience → slides → understanding check → justified optional resources/skills → QA**

Read the approved source before authoring. Assessment must test what the class actually teaches. Do not silently invent major curriculum claims. Internal terms such as “original guidebook,” “source PDF,” and “source material” must never appear in student-facing copy.

## 7. Conditional elements

**Student guide / workbook / PDF:** optional; create only when it materially helps execution, practice, reference, or a reusable workflow.

**Practical exercise:** optional; add when doing the work materially improves learning.

**Templates/checklists/resources:** optional; include only when practically useful.

**Skill Challenge:** separate from the class understanding check and optional for verification unless the curriculum explicitly changes that rule.

## 8. Production workflow

### Before building
1. Identify exact phase/module/class.
2. Read the approved source.
3. Define what the learner must understand or be able to do.
4. Choose the best teaching structure for that outcome.
5. Decide what assessment evidence is actually needed.
6. Decide whether existing skills or resources genuinely apply.

### Build
1. Compose the written/interactive teaching experience.
2. Build a content-driven teaching deck.
3. Build the appropriate understanding/completion check.
4. Add practice/resources only when justified.
5. Add skill mapping only when justified.

### QA
1. Content accuracy and source fidelity.
2. Teaching structure fits the topic rather than a template.
3. Slides rendered and visually inspected.
4. Assessment tested.
5. Completion persistence tested.
6. Next-class/module unlock tested.
7. Desktop tested.
8. Tablet tested where available.
9. Mobile tested at approximately 375px, 390px and 430px.
10. Production deployment checked where tooling permits.

Never claim a QA step passed unless it was actually performed.

### Mandatory slide QA gate
A deck is not production-ready when the PPTX merely generates or passes an automated test. Every production deck must be generated, rendered slide-by-slide to images, visually inspected, checked with the available overflow/layout tests, corrected where needed, re-rendered after every correction, and visually inspected again before the final asset is uploaded or connected to the Academy.

Passing an automated overflow check does not mean visual QA passed. Never report slide visual QA as complete unless the rendered output was actually inspected.

## 9. Mobile production standard

A class must be comfortable to learn from on mobile, not merely technically responsive.

Check:

- headings and paragraph measure
- cards, comparisons and grids
- assessment answers and selected states
- feedback placement
- buttons and at least comfortable touch targets
- progress bars and resource controls
- video placeholder/player
- completion and next-step states
- margins, padding and vertical rhythm
- long text wrapping
- clipping and horizontal overflow

Stack or recompose teaching layouts when that improves comprehension. Do not squeeze desktop UI onto mobile.

The learner should always understand: **Where am I? What am I learning? What do I do next?**

The embedded slide lightbox must also remain usable on mobile: preview fits viewport, Close and Download remain reachable, loading works, controls do not collide, and opening/closing does not create broken scrolling.

## 10. Module audit rule

Before expanding a module, audit its existing classes against their approved sources.

For each class ask:

1. What is the real learning outcome?
2. What concepts matter?
3. What should the learner remember or be able to do?
4. Does the current structure teach that efficiently?
5. Is the page copying another class unnecessarily?
6. Is anything important missing or redundant?
7. Does the assessment produce useful evidence?
8. Is its question count justified?
9. Do the slides support rather than repeat the lesson?
10. Are resources and skill mappings justified?
11. Does progression work?
12. Is the experience genuinely comfortable on mobile?

Do not change something merely to make classes look different.

## 11. Shipping checklist

- [ ] content grounded in approved source
- [ ] structure chosen for this lesson, not inherited mechanically
- [ ] no fixed section/slide/question count imposed
- [ ] Manrope and Assistara visual language
- [ ] real approved logo in slides
- [ ] slides rendered and visually inspected
- [ ] assessment tests taught material
- [ ] optional resources exist only when useful
- [ ] skill mapping only when justified
- [ ] preview/download works
- [ ] completion persists
- [ ] progression/unlock works
- [ ] desktop/mobile QA actually performed
- [ ] no internal/source terminology exposed

## 12. Core rule

Do not ask:

**“How do I fit this lesson into our template?”**

Ask:

**“What is the clearest, most useful and most engaging way to teach THIS lesson?”**

Then express that answer through the Assistara design system.

Every lesson should belong to Assistara. Every lesson does not need to look the same.
