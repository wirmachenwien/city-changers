# City Changers — technical color reference

<!-- Generated from design/colors.json. Do not edit; run npm run colors:generate. -->
The brand guide shows the compact palette. This table is an implementation
reference, not a menu of interchangeable accents. Edit `design/colors.json`,
run `npm run colors:generate`, then `npm run colors:check`.
## Theme tokens

Use `var(--token)` in UI styles. Recipes mix opaque bases in sRGB, rounded to
8-bit channels before contrast is checked. Light/dark accent bases remain
explicit so contrast is not left to arbitrary automatic mixing.

| Token | Light | Dark | Print/export | Purpose |
|---|---|---|---|---|
| `--paper` | `#FDFCF9` | `#161511` | `#FFFFFF` | Page background. |
| `--ink` | `#1D1A16` | `#F2EDE3` | `#1D1A16` | Primary text. |
| `--ink-soft` | `#4A4743` | `#C2BDB5` | `#4A4845` | Secondary text and captions. |
| `--accent` | `#0C6B3C` | `#4CC38A` | `#0C6B3C` | Links, actions and positive emphasis. |
| `--accent-ink` | `#FFFFFF` | `#161511` | `#FFFFFF` | Text on the green accent. |
| `--accent-soft` | `#E5EEE6` | `#1E2D22` | `#E5EEE6` | Subtle green emphasis. |
| `--line` | `#D9D8D5` | `#3E3C37` | `#999896` | Decorative separators, not sole control boundaries. |
| `--control-border` | `#82807C` | `#797670` | `#82807C` | Visible boundaries for selects and other outlined controls. |
| `--panel` | `#F6F1EA` | `#23221E` | `#F6F1EA` | Neutral cards and FeatureBoxes. |
| `--warn` | `#8A4B00` | `#E8A33D` | `#8A4B00` | Warm supporting emphasis; not automatically a warning. |
| `--warn-soft` | `#FDF6E1` | `#332917` | `#FDF6E1` | Background of warm FeatureBoxes. |
| `--error` | `#A31F1F` | `#FF8A7A` | `#A31F1F` | Error text, paired with a written message. |
| `--mark` | `#FFE08A` | `#55401E` | `#FFE08A` | Search-result highlighting. |
| `--mark-ink` | `#1D1A16` | `#F2EDE3` | `#1D1A16` | Text on search highlighting. |
| `--focus` | `#0C6B3C` | `#4CC38A` | `#0C6B3C` | Focus rings on ordinary UI surfaces. |
| `--popup-link` | `#6CA588` | `#367D5A` | `#6CA588` | Icons and focus rings on inverse popup surfaces. |

## Supporting recipes

| Token | Light recipe | Dark recipe |
|---|---|---|
| ink-soft | neutral.ink 80% + neutral.paper 20% (sRGB) | neutral.cream 78% + neutral.dark 22% (sRGB) |
| accent-soft | green.light 10% + neutral.paper 90% (sRGB) | green.dark 14.000000000000002% + neutral.dark 86% (sRGB) |
| line | neutral.ink 16% + neutral.paper 84% (sRGB) | neutral.cream 18% + neutral.dark 82% (sRGB) |
| control-border | neutral.ink 55.00000000000001% + neutral.paper 45% (sRGB) | neutral.cream 45% + neutral.dark 55% (sRGB) |
| panel | amber.light 6% + neutral.paper 94% (sRGB) | neutral.cream 6% + neutral.dark 94% (sRGB) |
| warn-soft | amber.highlight 22% + neutral.paper 78% (sRGB) | amber.dark 14.000000000000002% + neutral.dark 86% (sRGB) |
| mark | amber.highlight | amber.dark 30% + neutral.dark 70% (sRGB) |
| popup-link | green.light 60% + neutral.paper 40% (sRGB) | green.dark 60% + neutral.dark 40% (sRGB) |

## Utilities

These support QR codes, protected artwork backings, overlays and shadows; they
are not additional brand accents. Transparent and currentColor are also allowed.

| Token | Value | Source |
|---|---|---|
| `--white` | `#ffffff` | neutral.white |
| `--black` | `#000000` | neutral.black |
| `--art-paper` | `#fdfcf9` | neutral.paper |
| `--art-dark` | `#161511` | neutral.dark |
| `--scrim` | `rgba(0, 0, 0, 0.45)` | neutral.black at 45% opacity |
| `--video-scrim` | `rgba(0, 0, 0, 0.65)` | neutral.black at 65% opacity |
| `--shadow-soft` | `rgba(0, 0, 0, 0.16)` | neutral.black at 16% opacity |
| `--shadow` | `rgba(0, 0, 0, 0.2)` | neutral.black at 20% opacity |
| `--shadow-strong` | `rgba(0, 0, 0, 0.3)` | neutral.black at 30% opacity |
| `--cover-shadow-deep` | `rgba(0, 0, 0, 0.82)` | neutral.black at 82% opacity |
| `--cover-shadow-mid` | `rgba(0, 0, 0, 0.45)` | neutral.black at 45% opacity |
| `--cover-shadow-faint` | `rgba(0, 0, 0, 0.05)` | neutral.black at 5% opacity |
| `--cover-shadow-edge` | `rgba(0, 0, 0, 0.25)` | neutral.black at 25% opacity |

## Print exceptions

White paper and monochrome secondary text/separators conserve ink. Body text, links and FeatureBox colors use registered tokens, not reader defaults. Exporters resolve tokens to literal CSS for older EPUB readers. Reading apps may apply their own user-selected theme overrides.

- **paper:** neutral.white.
- **ink-soft:** neutral.ink 80% + neutral.white 20% (sRGB).
- **line:** neutral.ink 45% + neutral.white 55% (sRGB).

Legacy export-only green/amber fills and arbitrary print grays are consolidated
into these tokens. PDF/EPUB builders materialize literal CSS values so older
readers do not need CSS custom-property support.

## Protected artwork

| Name | HEX | Use |
|---|---|---|
| Mascot Green | `#176B43` | Fixed mascot body color; do not recolor. |
| Mascot Ink | `#20221C` | Fixed outlines and boots in the Ink treatment. |
| Mascot Yellow | `#FFD84F` | Fixed mascot detail and idea-ray color. |
| Idea Highlight | `#FFF0A8` | Fixed pale highlight in the Think pose. |
| Linen | `#CBBF9F` | Fixed pale outlines and boots in the Linen treatment. |
| Cream Lettering | `#F2EDE3` | Logo lettering on dark backgrounds. |
| Presentation Neutral | `#EFEEE5` | Frozen presentation-board background in existing artwork; not a UI color choice. |

Colors in partner logos, photos and license badges remain external artwork.
Changing this registry never regenerates mascot SVGs, Lotties or videos.

## Enforcement and exceptions

Run `npm run colors:check` before committing. It checks generated-file freshness,
registered contrast pairs (4.5:1 text; 3:1 essential graphics; 7:1 QR codes), and literal color
drift in owned source code. CI runs the same check. Decorative separators are
not tested as control boundaries; image overlays require visual review.

The audit includes all tracked and non-ignored new source files, not only the
current source folders. Shorthand declarations and inline styles are checked too.
CSS variable references without a fallback must resolve to a registered token
or a defined local alias. Direct Astro, PDF/EPUB and brand-kit entrypoints also
reject generated colors whose source-registry fingerprint is out of date.
Protected artwork palette references are compared read-only with their source
assets; changing a documented artwork color cannot silently mislabel the assets.

Literal-color exceptions are limited to generated outputs, tests and protected
artwork/tooling. Each exception is listed with its reason in the registry.

- `src/assets`: Supplied and generated artwork, photos, partner marks and fonts are not UI palette choices.
- `design/icons/artwork/favicon.svg`: Byte-identical inventory copy of public/favicon.svg; icons:check verifies preservation, never recolors artwork.
- `design/icons/artwork/logo-small.svg`: Byte-identical inventory copy of src/assets/site/logo-small.svg; icons:check verifies preservation, never recolors artwork.
- `design/icons/artwork/cc-by.svg`: Byte-identical inventory copy of the supplied Creative Commons badge; its external artwork colors are not UI tokens.
- `design/colors.json`: Editable source of truth; base colors and recipes are validated before generation.
- `src/data/colors.generated.json`: Generated registry output; exact freshness is checked.
- `src/styles/colors.generated.css`: Generated registry output; exact freshness is checked.
- `scripts/lib/colors.mjs`: Color serialization and audit implementation, tested independently.
- `scripts/tests`: Tests contain deliberate literal fixtures and expected values.
- `design/tests`: Tests contain deliberate artwork-color fixtures and expected values.
- `design/assets`: Protected logo masters and mascot sources. Palette changes do not authorize artwork edits.
- `design/motion`: Protected animation sources and dependency tree; do not regenerate videos or Lotties.
- `design/scripts/build-brand-assets.py`: Artwork generator; changing it would invalidate protected generated assets.
- `design/scripts/build-mascot-kit.py`: Artwork generator; its presentation tile neutral is not an interface color.
- `public`: Generated assets and supplied third-party files; website chrome config is independently checked by check:config.
