# Assistara Academy — Lesson Slide Production Standard

## Canonical format
Lesson slides are produced as a **single landscape 16:9 PDF per class**. PDF is the production/master learner artifact. Do not build learner-facing HTML/SVG presentation runtimes and do not use PPTX as the Academy default.

## Canonical visual reference
The production reference is **Phase 1 → Module 3 → Class 1 — Google Workspace Navigation**. Future decks must match its level of art direction, visual teaching, spacing, interface realism, brand fidelity and mobile readability. It is a quality reference, not a layout template: never copy its ten compositions mechanically into an unrelated lesson.

## Production workflow
1. Read the approved original course source for the class.
2. Define the learning outcome and design the teaching story before laying out pages.
3. Choose the strongest visual form for every idea: system map, process, comparison, decision ladder, annotated example, simplified interface, sequence or synthesis.
4. Generate one fixed-layout PDF, one slide per PDF page, landscape 16:9.
5. Use deterministic layout/rendering for all text, logos, diagrams and UI mockups. Image generation may supply illustrations only; never use it for important text, the Assistara logo, tables or precise UI.
6. Render and visually inspect every PDF page before publishing. Fix clipping, overflow, weak hierarchy, spelling, inconsistent spacing, distorted assets and tiny text.
7. Store the final PDF in the class folder under Production Course Material and connect that PDF to the Academy Lesson Slides action.
8. Keep assessment/questions on the lesson page. Do not put quizzes or Quick Decisions inside the slide deck unless explicitly requested.

## Visual system
- Manrope throughout.
- Warm cream/off-white, near-black and Assistara yellow, with restrained peach/sage accents only where useful.
- Large typography, generous whitespace and clear editorial hierarchy.
- One main teaching idea per slide.
- Prefer diagrams, flows, annotated examples, realistic simplified UI and visual hierarchy over paragraphs and repetitive card grids.
- Avoid corporate PowerPoint styling, generic AI deck aesthetics, random gradients, stock-photo filler and walls of text.
- Slides must remain comfortably readable inside the phone-sized lesson viewer.

### Brand lockup
- Use the approved `assistara-logo.svg` artwork, including its black internal A. Never substitute a yellow square, typed A, generated mark or approximation.
- Use one lockup per page: real square logo followed by **Assistara Academy** in Manrope Bold.
- Keep the lockup in one consistent position, scale and safe margin throughout a deck. It must be clearly visible at phone size while remaining secondary to the teaching headline.
- Never stretch, crop, recolor, distort or rebuild the logo.

### Composition language
- Begin each page with a clear hierarchy: small context label, outcome-led headline and only the minimum supporting sentence needed.
- Build the remainder around the strongest teaching form for that idea.
- Use whitespace deliberately. Empty space is structure; do not fill it with decorative icons, stock imagery or arbitrary shapes.
- Create visual rhythm across the deck. Alternate light and dark foundations, dense and open compositions, and diagram/interface/example pages when the learning story supports it.
- Rounded cards and pills are supporting devices, not the default layout. Avoid repeating the same grid on every page.
- Use yellow for the primary idea or decision, not as general decoration. Sage and peach may distinguish supporting states or categories.

### Visual teaching standard
- The learner should understand the main point in approximately 3–5 seconds.
- Show relationships spatially whenever the lesson explains a system, sequence, hierarchy, comparison or decision.
- For software lessons, use clean, realistic simplified interfaces with believable labels and states. Do not paste screenshots with irrelevant chrome or draw interfaces that misrepresent how the tool works.
- Use concrete learner-facing examples instead of abstract claims. Show the file structure, client update, tracked status, calendar block or workflow the learner needs to recognize.
- End with an application or synthesis page that reconnects the lesson’s ideas. Keep quizzes and Quick Checks on the lesson page unless explicitly requested.

### Typography and legibility
- Use Manrope ExtraBold/Bold for headlines and key labels, Medium for emphasis and Regular for supporting copy.
- Headlines must dominate. Body copy must remain comfortably readable when viewed inside the mobile lesson viewer.
- Keep line lengths short, use sentence case for explanatory copy, and reserve uppercase for short context labels or compact UI states.
- Never shrink text to make excess copy fit. Rewrite, split or remove copy instead.

## Content rules
- Stay faithful to the approved source material while rewriting for concise visual teaching.
- Use short copy. The lesson page/video carries deeper explanation.
- Do not mention internal source files, “original guidebook,” prompts or production notes in learner-facing slides.
- Do not add claims, tools or procedures that the approved lesson does not teach.

## QA gate
A deck is not production-ready until every rendered PDF page has been visually inspected at full size and at phone-viewing size. Verify the real logo, embedded Manrope fonts, typography, margins, alignment, contrast, clipping, overflow, legibility, spelling, visual consistency, page order and teaching clarity. Re-render after every correction.

Then verify the production PDF opens from the real Lesson Slides action, every page loads, the download filename ends in `.pdf`, the viewer closes correctly, and desktop and mobile remain usable. Never claim live QA unless it was actually performed.

## Naming
Use: `Assistara_Academy_P{phase}_M{module}_C{class}_{Class_Name}_Lesson_Slides.pdf`

## Canonical reference history
Phase 1 → Module 3 → Class 1, Google Workspace Navigation, established the PDF-first standard after HTML/SVG/PPTX experiments proved less reliable. Its improved production version established the required Assistara art direction for future lesson decks.
