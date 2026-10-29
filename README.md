# Toolbox for City Changers

Trilingual handbook site (German, English, Slovene) for the Erasmus+ Toolbox
for City Changers project. Static Astro site, hosted on GitHub Pages.

## Quickstart

Requires Node ≥ 22.23.4 (plus Python ≥ 3.12 with `pip install -r requirements.txt` to build PDFs).

```sh
npm ci
npm run dev        # dev server with hot reload
npm run build      # site + PDF/EPUB downloads + search index
npm run preview    # serve the production build locally
```

Downloads and search need a build first (`npm run build` or
`npm run build:downloads`): under `astro dev` alone, downloads 404 and
search comes back empty. Without Python, the build skips the PDF/EPUB
downloads with a warning and still succeeds (CI always has Python and
stays strict).

## Checks

```sh
npm run check:site      # built-site integrity: translations, links, sitemap, search index
npm run check:glossary  # glossary coverage and dictionary sync
npm run check:config    # derived files (.pages.yml, robots.txt, webmanifest) in sync
```

## Configuration

`handbook.config.ts` is the single source of truth for site URL, base path,
download slug, languages, and default language. After changing it:

```sh
npm run sync:config  # regenerate .pages.yml, public/robots.txt, public/site.webmanifest
```

English is the default language and lives at the root (`/`, `/book/…`);
other languages live under `/<lang>/` and `/book/<lang>/…`. Prefixed default
language URLs (`/en/…`) redirect to the canonical root locations.

## Analytics

Cookieless [Plausible](https://plausible.io) tracking (production builds only,
via `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_SCRIPT_SRC` build env vars, wired to
repository Variables in `deploy.yml`). Unset = tracking disabled.

## Project layout

- `src/content/book/<lang>/`, `src/content/pages/<lang>/` — chapters and home/search pages (MDX)
- `src/components/`, `src/layouts/` — content components and page layouts
- `src/data/` — book catalogue, nav, locales, glossary (validated JSON)
- `src/lib/`, `src/scripts/` — URL/i18n helpers and client islands
- `scripts/bin/` — runnable entry points (PDF/EPUB pipelines, build checks, config sync)
- `scripts/handbook/` — shared Python library imported by the builders
- `scripts/lib/` — shared JS helpers imported by the `bin/` entries
- `.pages.yml` — PagesCMS content model (generated, see above)

## License

Code: [AGPL-3.0](LICENSE) Bernhard Hayden. Handbook contents: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
Wir machen Wien, Changing Cities & Prostorož, unless stated otherwise.
Site code inspired by [Electric Book Works](https://electricbookworks.com).
