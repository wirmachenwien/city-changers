# City Changers brand library

**Start here:** the brand guide is published at `/brand`.
It is unlisted, excluded from search and the sitemap, and marked `noindex`.
It is not authenticated: anyone with its URL can access it.

## Single sources of truth

- **`brand-guide.mdx`** — the only authored brand guide, including all live
  component examples. It is edited as one document in Pages CMS, rendered on
  the website and included unchanged as `BRAND-GUIDE.md` in the downloadable kit.
- **`assets/`** — the sole logo master (`logo/logo-lockup.svg`) and mascot pose
  definitions. Derived logos live in `src/assets/site/`, mascot media in
  `src/assets/mascot/`, fonts in `src/assets/fonts/`, supporting images in
  `src/assets/book/` and `src/assets/site/`, and web icons in `public/`.
  Edit the design logo master, not its generated application copy.
- **`manifest.json`** — one inventory for website downloads and recipient kits.
- **`motion/`** — the editable animation project, with independent Studio rigs.
- **`icons/`** — [hand-drawn icon library and old archive](icons/index.html).
  Generous idea sparks are selected for lists. `npm run icons:build` exports the
  approved SVG/PNG assets into `src/assets/icons/`; it never renders mascot videos.
- **`docs/`** — [maintenance](docs/maintenance.md) and recipient instructions.
- **`scripts/`, `tests/`** — production tools and checks.
- **`handoff/`** — generated deliveries; ignored.

## Build and share

```sh
npm run design:plan   # list stale asset groups without changing files
npm run design:build  # rebuild only stale groups and refresh the website ZIP
npm run design:check  # fail if any generated artwork is stale
npm run design:prepare # validate committed artwork and refresh the website ZIP only
```

After editing design sources, run `npm run design:build` locally, review the
results, and commit the sources, generated assets and `design/build-state.json`
together. That tracked record fingerprints both inputs and outputs.

Normal `npm run build`, `npm run dev`, CI and deployment validate that record and
package the committed assets. They never regenerate artwork or silently repair
stale outputs. CI restores no artwork cache and makes no bot commits. The ZIP
and website delivery copies are still prepared automatically.

Download the current kit from the team page, or send
`public/brand-assets/city-changers-brand-kit.zip`. For an immutable local handoff:

```sh
python3 design/scripts/package-brand-kit.py --output design/handoff/2026-10-28
```

Packaging refuses to overwrite an existing release. Human review of artwork,
animation transparency, permissions and credits is still required before use.
