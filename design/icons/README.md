# City Changers icons

Open [index.html](index.html) directly in a browser to browse icons at 16, 24
and 40 pixels, search by name, and download generated SVG/PNG assets.

## Sources and production outputs

- **`drawn/*.svg`** — editable, approved 24×24 SVG sources. These are the source
  of truth for the full production family, including generous idea-spark bullets.
- **`old/`** — original codebase icons, previously called `current`. Reference
  only; never overwritten by the build.
- **`manifest.json`** — names, source locations, selected family and PNG size.
- **`artwork/`** — unchanged copies of favicon, app-icon and CC BY artwork.
- **Decorative icons** — sprout, spark, stepping stones, neighbourhood flag,
  crosswalk and pebble, each with its matching nested variant. They are ordinary
  icons in the library. Idea sparks at generous 1.1rem size remain active on lists.

Generated production files live in **`src/assets/icons/`**:

- `<name>.svg`: exact vector source, retaining `currentColor`.
- `png/light/<name>.png`, `png/dark/<name>.png`: transparent 96×96 exports.
  Controls resolve the registry's `ink` token; bullets use `accent`.
- `src/data/icons.generated.json`: the same SVG markup with decorative SVG
  attributes for Astro components and JavaScript-created controls.

```sh
npm run icons:build  # export SVGs, PNGs, runtime markup and icon catalog
npm run icons:check  # validate sources, generated outputs and PNG fingerprints
```

Normal dev/build commands only check these committed outputs. They never redraw
icons or repair stale PNG fingerprints. PNGs are rendered only when their source,
semantic export color, renderer or size changes; the separate icon freshness file
prevents cross-platform rasterization differences from causing unnecessary churn.

## Visual language

Hand-drawn curves, rounded ends and a consistent optical weight. The link uses
two clearly separated chain loops joined by a short bridge. The SVG sources are
shared by static components, popup controls, bookmarks, heading permalinks,
external links, disclosure arrows, pagination, slides and video play buttons.

Idea-spark bullets use the exact SVG silhouette at 1.1rem on the web and matching
PNG silhouettes in PDF/EPUB. Nested lists use the outlined spark. Native list
semantics, RTL-aware positioning and hanging indents are preserved.

Social marks retain their recognizable silhouette; only their surrounding frame
is hand-drawn. The close/X glyph continues its existing X/Twitter sharing role.
Brand logos, mascots, QR matrices and MOV exports are not redrawn or recolored.
