# Assistara Masterclass — YouTube Livestream Thumbnails

**Thumbnail:** How to Land Your First Remote Client (Even as a Complete Beginner)
**Format:** 1280 × 720 PNG (16:9), ready for YouTube upload.

## Deliverables (`out/`)

| File | Concept |
|---|---|
| `01-editorial.png` | Editorial — cream canvas, ink panel, magazine masthead, signature yellow marker highlight |
| `02-cinematic.png` | Cinematic — deep charcoal, yellow key light, lens ring, gradient keyword glow |
| `03-minimalist.png` | Minimalist — white canvas, hairline geometry, single yellow accent |
| `comparison.png` | All three side by side (3844 × 784) |

Editable sources live in `src/*.html`; self-contained builds (font inlined) in `out/html/`.

## Brand fidelity (verified against getassistara.com + assistara-local-v9)

- **Logo:** the real `assistara-logo.svg` (yellow `#FFD51F` rounded square, ink `#151515` "A") — inlined verbatim, never recreated.
- **Colors:** `--yellow #FFD51F`, `--ink #151515`, `--cream #FBFAF6`, `--muted #66625F`, `--line #DEDBD3` from `styles.css`.
- **Typeface:** Manrope (variable, 200–800), embedded locally (`assets/fonts/manrope-variable.woff2`) so renders are identical everywhere. Headlines use Manrope 800 with the site's tight tracking (-0.045em); kickers use the site's letterspaced caps treatment (0.2em).
- **Signature highlight:** the yellow marker bar behind `CLIENT` mirrors the site's `h1 span:after` highlight in `styles.css`.
- **LIVE indicator:** small dot + letterspaced `LIVE`, styled after the site's live banner (`● LIVE NOW` in `#FFD51F`). Tasteful pill, kept clear of the bottom-right duration-badge zone.
- **Lockup:** icon + "Assistara Academy" wordmark, matching the masterclass presentation deck header on every slide.

## Re-render

```bash
node build.mjs                 # regenerate self-contained HTML (font base64 inlined)
node serve.mjs 8722            # serve out/html at http://127.0.0.1:8722
# open each page, wait for fonts, screenshot the tab, then:
python crop.py <screenshot.png> <out.png> <dpr> <vw> <vh>
python make-comparison.py      # rebuild the side-by-side strip
```

`crop.py` crops the 1280×720 stage from the DPR-1.5 supersampled screenshot and downsamples with Lanczos — that is what keeps the text crisp at final size.

## Design rules honored

No people/faces, no stock imagery, no invented logos, no decorative arrows/stars/squiggles, no giant red LIVE badge, no serif fonts, no non-brand gradients. All graphic elements derive from the brand system (yellow marker, ink/cream split, rounded-square geometry, soft yellow glow from the hero visual).
