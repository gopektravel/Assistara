# Assistara Academy — Lesson Slide Production Standard

## Canonical format
Lesson slides are produced as a **single landscape 16:9 PDF per class**. PDF is the production/master learner artifact. Do not build learner-facing HTML/SVG presentation runtimes and do not use PPTX as the Academy default.

## Production workflow
1. Read the approved original course source for the class.
2. Design the teaching story before laying out pages.
3. Generate one fixed-layout PDF, one slide per PDF page, landscape 16:9.
4. Use deterministic layout/rendering for all text, logos, diagrams and UI mockups. Image generation may supply illustrations only; never use it for important text, the Assistara logo, tables or precise UI.
5. Render and visually inspect every PDF page before publishing. Fix clipping, overflow, weak hierarchy, spelling, inconsistent spacing, distorted assets and tiny text.
6. Store the final PDF in the class folder under Production Course Material and connect that PDF to the Academy Lesson Slides action.
7. Keep assessment/questions on the lesson page. Do not put quizzes or Quick Decisions inside the slide deck unless explicitly requested.

## Visual system
- Manrope throughout.
- Warm cream/off-white, near-black, Assistara yellow; restrained sage/peach only where useful.
- Real Assistara square logo + “Assistara Academy”; never redraw the logo with AI.
- Large typography, generous whitespace, clear hierarchy.
- One main teaching idea per slide.
- Prefer diagrams, flows, annotated examples, realistic simplified UI and visual hierarchy over paragraphs and repetitive card grids.
- Avoid corporate PowerPoint styling, generic AI deck aesthetics, random gradients, stock-photo filler and walls of text.
- Slides must remain readable on a phone.

## Content rules
- Stay faithful to the approved source material, while rewriting for concise visual teaching.
- A learner should understand the main point of a slide in roughly 3–5 seconds.
- Use short copy. The lesson page/video can carry deeper explanation.
- Do not mention internal source files or “original guidebook” in learner-facing slides.
- End with a useful recap/application slide when appropriate, not an embedded quiz.

## QA gate
A deck is not production-ready until every rendered PDF page has been visually inspected. Verify logo, typography, margins, alignment, legibility, spelling, visual consistency, page order and mobile readability. Then verify the actual PDF opens from the live lesson. Never claim live QA unless it was actually performed.

## Naming
Use: `Assistara_Academy_P{phase}_M{module}_C{class}_{Class_Name}.pdf`

## Current pilot
Phase 1 → Module 3 → Class 1, Google Workspace Navigation, established this PDF-first standard after HTML/SVG/PPTX experiments proved less reliable for the Academy learner experience.
