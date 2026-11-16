# Toolbox for City Changers

English, German and Slovenian handbook for the Erasmus+ Toolbox for City Changers
project. Built with Astro and published as a static site on GitHub Pages.

## Setup and development

Requires **Node ≥22.23.4** and **Python ≥3.12**. In your Python environment,
install the asset tooling; add the export dependencies for PDF/EPUB builds:

```sh
npm ci
python3 -m pip install -r design/requirements.txt
python3 -m pip install -r requirements.txt  # Optional locally; WeasyPrint also needs platform libraries

npm run dev -- --background  # Local site with hot reload
npm run build               # Static site, PDF/EPUB exports and search index
npm run preview             # Serve the production build
```

Manage the background server with `npx astro dev status`, `npx astro dev logs`
and `npx astro dev stop`. Dev prepares a search snapshot under `.astro/` without
changing `dist/`; restart it to refresh search after content edits.

PDF/EPUB downloads need `npm run build:downloads` or a full build before they work
in dev. Missing export dependencies produce a warning locally; CI requires them.
Normal dev/build commands never regenerate artwork or narration.

## Content and configuration

- **English is the editorial source:** edit `src/content/book/en/` and
  `src/content/pages/en/`, then update German and Slovenian, including headings,
  examples, questions, references and captions. Automated checks compare structure
  and sources; translation meaning still needs editorial review.
- **URLs:** English lives at `/` and `/book/…`; other languages at `/<lang>/`
  and `/book/<lang>/…`. Prefixed English URLs redirect to their canonical paths.
- **Site settings:** edit `handbook.config.ts` for the URL, base path, download
  slug and languages. Run `npm run sync:config` afterward to update `.pages.yml`,
  `public/robots.txt` and `public/site.webmanifest`.
- **Colors:** `design/colors.json` is the source of truth. Use semantic CSS
  variables; after registry edits, run `npm run colors:generate` and
  `npm run colors:check`. Never hand-edit generated color files.

## Design assets

See the [brand library guide](design/README.md) for sources, exports and releases.
The live guide is at `/brand` (unlisted, not access-controlled).

Start with `npm run design:plan`; validate with `npm run design:check`.
Regenerate only the requested assets—mascot videos require explicit approval.
For static mascot edits, use `python3 design/scripts/build-design.py --stills`.

Website builds prepare lightweight previews and release links. Original assets
and the complete brand kit live in immutable, checksum-verified GitHub Releases.

## Book audio

See the [audio guide](audio/README.md) for generation, testing and publication.
Preparation needs FFmpeg/ffprobe; publishing needs an authenticated GitHub CLI.

- `npm run audio:plan` reports narration readiness and generation cost.
- `npm run audio:prepare` assembles retained narration without paid calls or uploads.
  The complete local edition goes into `public/audio/`; stale managed folders
  are pruned after success. Private recordings and API responses stay in `.cache/audio/`.
- Dev serves local MP3s/M4Bs; Git ignores them and production builds exclude them.
  Production media comes from GitHub Releases; only cue JSON stays on the site.
- Generation is manual and budget-capped. Commit a reviewed edition on a branch,
  push that branch, then explicitly publish with `npm run audio:release -- --publish`
  before merging its manifests to `main`. Keep credentials out of Git.

## Validation

Run these before merging, and again after rebasing content changes:

```sh
npm run check:config    # Generated site/CMS configuration
npm run check:glossary  # Term coverage and dictionaries
npm run build
npm run check:site      # Built pages, translations, links, sitemap and search
npm run audio:test     # Offline pipeline, player and release tests
```

For a prepared audio edition, also run `npm run audio:check` and
`npm run audio:release` (offline attachment verification; no uploads).

## Deployment and analytics

Pull requests run CI checks. Pushes to `main` build and deploy GitHub Pages,
publish or reuse the matching brand release, and verify any referenced audio
release. Deployment never generates narration or uploads an audio edition.

Cookieless [Plausible](https://plausible.io) tracking is production-only. Set the
repository variables `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_SCRIPT_SRC` (the site's
`pa-….js` URL); unset values disable tracking. Enable download/outbound events in
Plausible and verify a real visit after deployment.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/content/`, `src/data/` | MDX pages, book catalogue, navigation, translations and glossary |
| `src/components/`, `src/layouts/` | Shared UI and page layouts |
| `src/lib/`, `src/scripts/` | Rendering, URL helpers and browser interactions |
| `scripts/bin/`, `scripts/handbook/`, `scripts/lib/` | Site checks, export builders and shared tooling |
| `design/` | Brand sources, asset inventory, tooling and documentation |
| `audio/`, `scripts/audio/` | Narration configuration, edition manifests and pipeline |

## License

Code: [AGPL-3.0](LICENSE), Bernhard Hayden. Handbook contents:
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), Wir machen Wien,
Changing Cities & Prostorož, unless stated otherwise.
Site code inspired by [Electric Book](https://github.com/electricbookworks/electric-book) by Electric Book Works.
