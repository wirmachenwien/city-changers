# Selected handbook elements

Open [index.html](index.html) for the selected assets, light/dark previews and
variable-width/longer-text examples. The original discarded SVGs are restored in
the separate [archive](archive/index.html), rather than mixed into active imports.

## Selection

**Natural for everything except medium vertical strokes, which use Gentle.**
The same exception applies to both the thin quote rail and filled accent bar.
FeatureBox now trials the restored **open margin bracket** instead of a filled
closed panel and accent bar. Other selected treatments remain unchanged.

| Source | Selection | Website use |
| --- | --- | --- |
| `lines/divider-strong.svg` | Natural | Masthead/footer boundary |
| `lines/divider.svg` | Natural | Editorial, pagination, footnote, contents/search and table rules |
| `lines/vertical-rule-short.svg` | Natural, 32px crop | One-line quote rail |
| `lines/vertical-rule-medium.svg` | **Gentle**, 80px crop | Medium quote rail |
| `lines/vertical-rule.svg` | Natural, 240px | Longer quote rail |
| `lines/accent-bar-short.svg` | Natural, 32px crop | Sidebar/current-item accents |
| `lines/accent-bar-medium.svg` | **Gentle**, 80px crop | Medium callout accents |
| `lines/accent-bar.svg` | Natural, 240px | Longer licence accents |
| `lines/bracket.svg` | Restored original | FeatureBox margin bracket, default/warm tones |
| `lines/bracket-short.svg` | 56px, restrained stem | Single-line FeatureBox |
| `lines/bracket-medium.svg` | 104px, gentle stem | Medium FeatureBox |
| `frames/frame-*.svg` | Natural | CSS panel masks exported from `framePath` |
| `frames/compact-*.svg` | Natural | CSS control masks exported from `compactPath` |
| `frames/bubble-{side,top}-*.svg` | Natural | CSS speech masks exported from `bubblePath` |
| `geometry.js` → `framePath(width, height)` | Natural | Exact image/video clipping |

There are no level parameters or alternate profiles in the active geometry.
Edit the selected masters directly; keep older studies in `archive/`. These
sources are not recipient-kit assets.

## Integration

- `src/styles/drawn-elements.css` imports the eight rule/rail masters directly.
  `FeatureBox.astro` imports short, medium and original tall brackets, split into
  fixed 24px caps and a variable middle with non-scaling strokes.
  `src/scripts/feature-brackets.ts` observes the full box height and selects short
  below 80px, medium below 136px, and tall otherwise. It follows wrapping, font
  loading and content changes, and releases detached boxes. Only decoration
  changes; content spacing and focus rings remain untouched. Before measurement
  or without ResizeObserver/JS, a simple accent line replaces the bracket.
  Default green and warm amber are preserved, and RTL mirrors the bracket.
  Colors
  use the semantic tokens from `design/colors.json`, never baked-in palette copies.
- `src/styles/drawn-elements.css` uses nine-slice CSS masks for boxes, controls,
  popups and speech bubbles. These work on first paint and without JavaScript;
  dynamic content gets the same styling automatically. No box/rail observer or
  readiness class is used for these boxes. Corners, stroke thickness and tails stay fixed;
  waves along the connecting edges stretch as content changes.
- Run `npm run elements:build` after changing `geometry.js`. This exports only
  eight palette-free SVG masks and `frames/frames.css`; it never touches mascot
  media. `npm run elements:check` verifies freshness. The library preview uses
  these same CSS masks. Archived SVG studies remain untouched.
- Select wrappers and closed-accordion decoration are server-rendered. The
  internal `DrawnSelect.astro` shell is shared by `LanguageMenu` and `SelectList`;
  callers retain their own labels, navigation options and no-JS fallbacks. The
  `rehypeDrawnContainers` plugin and `TableWrap` provide stationary frames outside
  scrollable table/code content at build time. `src/scripts/drawn-tables.ts`
  measures header height and paints a separate panel background through the exact
  same nine-slice CSS mask as the outer frame. Only decorative paint is masked;
  table text, scrolling and focus indicators remain unclipped. No header fill is
  shown before measurement or without JS, avoiding a leaking rectangular flash.
  Print and forced colors retain native cell backgrounds and borders.
- Theme toggles and mobile menu/close toggles use the shared pebble silhouette.
  Their idle fill matches the current surface (`accent-soft` in the masthead,
  `paper` in the drawer); hover and keyboard focus reveal a stronger soft-green
  fill. Only background paint is masked, leaving icons and focus rings intact.
- Rails use context rather than measured height: sidebar links default to short,
  quotes to tall. An explicit `data-rail-size="short|medium|tall"` selects a crop
  where needed; medium still selects Gentle. Licence panels keep a native accent.
- The short Natural SVG uses the tall Natural path with a y=44 viewport crop;
  medium Gentle uses its original Gentle path with a y=92 crop. Mask lengths
  remain at least 32/80/240px, cropping in shorter space rather than compressing
  a long wave. They extend only when the available space exceeds the source length.
- `src/scripts/drawn-media.ts` measures only image/video stages for exact clipping,
  backed by the original `framePath`. Before enhancement or without JS, media
  uses a normal border in the same semantic color, not a drawn overlay on the
  rectangular image. Captions and focus rings stay unclipped.
- Speech tails are part of the perimeter, not an attached overlay. CSS media
  queries choose side/top tails; RTL mirrors only the decorative layers.
- Native controls, rectangular hit areas and unclipped keyboard focus remain.
  `src/scripts/link-underlines.ts` measures underlined link text with Range and
  paints the Quiet rule (`lines/divider.svg`) per wrapped line. Paint inherits
  `currentColor`; no palette copies or extra text are introduced. Resize, font
  readiness and content/hover changes refresh the decoration.
  Page-height-only changes do not trigger page-wide redraws; details toggles and
  hover refresh only affected links, and unchanged geometry reuses existing paint.
  Text mutations refresh only the owning link; added/removed subtrees are scanned
  locally instead of reconciling every link on the page.
  Links without underlines stay undecorated; dotted glossary hints stay distinct. Without JS
  or measurement/mask support, and in print/forced colors, native underlines remain.
  Pagination initializes `pagination-underlines.ts` from its own component. It
  measures the inner title text with Range and paints one Quiet rule per line,
  including shorter continuation lines and right-aligned titles. Only label
  dimensions are observed; neither page height nor hover triggers redraws.
  Artwork is decorative, hidden from assistive technology and pointer-transparent.
  Print, forced colors and unsupported masks keep plain boundaries. Missing
  JavaScript still gets drawn CSS boxes. PDF/EPUB
  styles, icons, logos and mascot media are unchanged.

`preview.js` only wires the disk-openable library controls; it does not draw.
`geometry.js` exposes named ES module exports, with no global side effects.
`geometry.d.ts` supplies their shared function types; `elements.test.mjs` validates
the active inventory, restored archive, geometry and previews. The archive
contains 25 original masters/references plus the 16 discarded profile exports;
the selected line sources are still the canonical files outside the archive.

```sh
node --test design/elements/elements.test.mjs scripts/tests/drawn-elements.test.mjs
npm run elements:check
npx astro build && node --test scripts/tests/figure-rendered.mjs
npx astro check
npm run colors:check
```

`scripts/tests/drawn-browser.mjs` checks the built site with page JavaScript
disabled, at mobile/desktop widths, with native details, keyboard focus, print
and forced colors. Serve `dist` on port 18765 and start headless Chrome with
`--remote-debugging-port=9223`, then run `node scripts/tests/drawn-browser.mjs`.
It also checks computed button/select/underline styles, light/dark hover colors,
paint-only animation and reduced-motion behavior, rather than CSS selector spelling.
Rendered select labels, selected-text mirrors and decorative semantics are checked
in `figure-rendered.mjs`; small unit tests cover client synchronization separately.
Override `SITE_URL`/`CHROME_URL` if needed. The script closes only its own tab.

No artwork generator, mascot render or broad design build is needed.

## Print and EPUB

`src/styles/export-drawn.css` carries the static counterparts of the screen
decoration. Both download builders append it through `scripts/handbook/drawn.py`,
which embeds the selected SVGs and resolves semantic colors from the print
palette. PDF export measures layout once, then clips table-header paint and
media to actual-size SVGs using the web's `framePath` through
`scripts/bin/drawn-paths.mjs`. Table text stays native and selectable. EPUB
media uses the same path at its intrinsic aspect ratio; reflowable table headers
keep their paint inset from the frame. Figure outlines use `media-line`, which
matches the web instead of the darker print separator color.

Bracket end caps stay 24px high, with the same short/medium/tall selection as the
web in PDFs. Reflowable brackets use separate cap and stem layers. Quote rails
retain their natural 240px scale, cropped rather than compressed. Numbered-list
hints mirror the web's single-digit sizing, including `start`, `value` and
`reversed`, centered on the first text line. Question markers use the warm
palette. Credits remain unfilled; credits and footnotes use the Quiet rule,
cropped to its stroke endpoints so it spans the full text width. Title-page
copy uses Newsreader, while glossary terms use Fraunces. All export copy,
captions, tables and running text use Newsreader; component titles and table
headers use Fraunces. Clarity City is screen-only and is not packaged in EPUBs.
Older EPUB readers fall back to native borders. Link notes, expanded sections
and revealed answers retain their print behavior. Mascot artwork is reused,
never regenerated by the exporters.
