# City Changers — practical brand guide

## Identity

The project name is Toolbox for City Changers. The mascot is called Green Fix.
It has seven expressive poses with static and animated assets available below.

## Logos

The active identity pairs the Green Fix symbol with the outlined City Changers
wordmark. Use the full lockup when the project name needs to be read; use the
symbol where the name is already present. The wordmark is supplied artwork,
not editable text or a Fraunces typesetting recipe.

Use `logo-lockup.svg` and `logo.svg` on light backgrounds, and their `-dark`
variants on dark backgrounds. The website's BrandLogo component selects the
matching treatment automatically. Use `logo-small.svg` for compact applications
and the supplied website icons for favicons and app icons. PNG exports are
available for tools that cannot import SVG.

Keep the supplied proportions and colors. Do not stretch, rotate, add effects,
crop the artwork, or rebuild the lettering. Review legibility at the actual
display size; no new minimum-size or measured clear-space standard is implied.

## Colors

<!-- Generated from design/colors.json by npm run colors:generate. -->
### Brand palette

Our brand palette uses **green** as its primary accent and **warm amber/brown**
for supporting emphasis, with paper and ink neutrals. Red is a functional UI
color, not a brand accent. Supporting shades are derived recipes, not
additional brand colors to choose independently.

Enter these HEX codes in your design app's color picker:

```text
Paper             #FDFCF9   Primary light background.
Ink               #1D1A16   Primary light-theme text; distinct from mascot ink.
Website green     #0C6B3C   Primary accent, links and actions.
Warm brown        #8A4B00   Supporting accent for warm FeatureBox highlights.
```

Use the semantic light/dark tokens for interfaces, rather than applying these
base colors to every background. Warm FeatureBoxes use the amber accent with
its generated tint. The detailed light/dark/export values, utilities and recipes
are in **COLOR-REFERENCE.md**, also available in the brand kit.

### Functional UI colors

These colors communicate an interface role, not a brand mood. Green and amber
reuse the brand families; red is reserved for errors and incorrect-answer
feedback. Always accompany status colors with text or another non-color cue.
Warm callouts are emphasis, not automatically warnings.

The light and dark values below come from the semantic tokens. Use the tokens
in interfaces, not fixed HEX values. Borders, muted text and focus indicators
are UI utilities, not additional brand accents.

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Error and incorrect answers | `--error` | `#A31F1F` | `#FF8A7A` | Incorrect-answer marks and incorrect, empty or incomplete-answer feedback; always paired with a written message. |
| Correct answers and actions | `--accent` | `#0C6B3C` | `#4CC38A` | Links, actions and positive emphasis. |
| Search highlight background | `--mark` | `#FFE08A` | `#55401E` | Search-result highlighting. |
| Search highlight text | `--mark-ink` | `#1D1A16` | `#F2EDE3` | Text on search highlighting. |
| Keyboard focus | `--focus` | `#0C6B3C` | `#4CC38A` | Focus rings on ordinary UI surfaces. |
| Inverse-surface focus and icons | `--popup-link` | `#6CA588` | `#367D5A` | Icons and focus rings on inverse popup surfaces. |
| Control boundaries | `--control-border` | `#82807C` | `#797670` | Visible boundaries for selects and other outlined controls. |
| Decorative separators | `--line` | `#D9D8D5` | `#3E3C37` | Decorative separators, not sole control boundaries. |
| Secondary text | `--ink-soft` | `#4A4743` | `#C2BDB5` | Secondary text and captions. |

### Protected artwork colors

| Name | HEX | Use |
|---|---|---|
| Mascot Green | `#176B43` | Fixed mascot body color; do not recolor. |
| Mascot Ink | `#20221C` | Fixed outlines and boots in the Ink treatment. |
| Mascot Yellow | `#FFD84F` | Fixed mascot detail and idea-ray color. |
| Idea Highlight | `#FFF0A8` | Fixed pale highlight in the Think pose. |
| Linen | `#CBBF9F` | Fixed pale outlines and boots in the Linen treatment. |
| Cream Lettering | `#F2EDE3` | Logo lettering on dark backgrounds. |
| Presentation Neutral | `#EFEEE5` | Frozen presentation-board background in existing artwork; not a UI color choice. |

Keep supplied artwork unchanged. Website ink and mascot ink are intentionally
different. These colors are not permission to recolor a mascot or partner logo.
Pale artwork outlines are not intended as small text colors.

Use CSS tokens for UI text/background pairs; automated checks cover registered
text and icon combinations, not arbitrary text over photos. Review image
contrast separately. Print uses white paper and documented neutral overrides;
it does not invent another green or amber palette. Screen colors are not a
print/CMYK specification: ask a printer for proofs.

## Type

Fraunces: main headlines. Clarity City: supporting text, labels and short captions.
Newsreader: optional longer editorial passages, matching the handbook.
For an ordinary social post, stick to Fraunces and Clarity City. Use fewer words
and larger type rather than squeezing a paragraph into a small graphic.
The logo is supplied artwork: installing Fraunces does not recreate the wordmark.

## Layout

Keep the original proportions: resize from a corner with proportions locked.
Leave visible breathing room on every side. As a practical starting point, allow
at least one boot's height between the artwork and nearby text or the edge.
This is a working recommendation, not a newly approved measured logo standard.
Do not crop the leaf or boots, rotate the full logo, add effects, or recolor it.
Use the light/dark variant that stays clear against the whole background.
Place pointing captions to the right. Keep captions away from the mascot's face.
There is no fixed minimum social-logo size: check legibility at actual phone size.

## Writing and images

Write clear, welcoming, practical copy. Describe a specific community action and
give one next step. Verify claims and results before publishing. Do not invent
quotes, endorsements or campaign outcomes. Use real project photography only
after checking permission and credits; supporting images are not a stock library.
