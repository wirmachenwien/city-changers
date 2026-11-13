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
- **`elements/`** — [reusable lines and shapes](elements/index.html).
  Approved drawn rules, rails, variable frames, labels and speech outlines power
  the handbook UI. Only the selected Natural set (Gentle for medium verticals)
  remains active, plus a restored open-bracket trial for FeatureBox. Discarded
  studies are preserved separately in `elements/archive/`. See
  `elements/README.md`; these sources are not recipient kit assets.
  Box/control decoration is CSS-only; `npm run elements:build` exports its
  nine-slice masks without touching mascot media. Media clipping, table-header
  backgrounds, bracket selection and text underlines use measured JS enhancements.
- **`docs/`** — [maintenance](docs/maintenance.md) and recipient instructions.
- **`scripts/`, `tests/`** — production tools and checks.
- **`handoff/`** — generated deliveries; ignored.

## Build and share

```sh
npm run design:plan   # list stale asset groups without changing files
npm run design:build  # explicit local artwork generation; inspect the plan first
npm run design:check  # fail if any generated artwork is stale
npm run design:prepare # validate committed artwork; prepare release links and previews
```

After editing design sources, run `npm run design:build` locally, review the
results, and commit the sources, generated assets and `design/build-state.json`
together. That tracked record fingerprints both inputs and outputs.

Normal `npm run build`, `npm run dev`, CI and deployment validate that record and
prepare lightweight website previews (Pillow from `design/requirements.txt` is
required). They never regenerate artwork or silently repair stale outputs.
CI restores no artwork cache and makes no bot commits.

The guide at `/brand` links to the matching GitHub Release for the complete ZIP
and every individual original. Deployment publishes a new content-addressed
`brand-YYYY-MM-DD[suffix]` release only when kit inputs change, after all checks and
before uploading Pages. Unchanged inventories reuse a checksum-verified release
without repackaging/uploading. Drafts can resume after interrupted uploads;
published releases are never overwritten and do not replace the repository's
latest software release. Pull requests do not publish releases. The publisher
uses `GITHUB_TOKEN` with `contents: write` in the deployment build job.
Paginated lookup and the draft/upload/verify/publish lifecycle share
`scripts/github_release.py` with the audio
publisher. The inventories and generation workflows stay independent; see
[`audio/README.md`](../audio/README.md) for the explicit local audio handoff.
Set the date and same-day revision in `design/edition.json`: revision `0` has no
suffix, `1` is `a` (the second edition that day), `2` is `b`, and so on. Titles
are exactly **City Changers brand**. These committed values keep builds stable;
advance them for changed kit inputs before publication. A conflicting inventory
fails closed instead of replacing an existing tag. The full inventory digest is
still validated. Existing tags are not renamed, because download links use them.
The shared publisher locks the full local transaction across checkouts, skips
verified existing attachments and uploads only missing ones without clobbering.
Corrupt or unexpected draft attachments fail closed; nothing is deleted to retry.
Native GitHub immutability protects new publications. Do not delete releases
still referenced by deployed pages; even immutable releases can be deleted as
a whole, after which their tag cannot be reused.

`public/brand-assets/` contains only a catalogue, release links, SVG previews and
small responsive WebP previews, not the ZIP, MOVs, fonts or original photos.
The first deployment of this change creates the initial release automatically.
Do not manually publish from an uncommitted working tree.

For an immutable local handoff:

```sh
python3 design/scripts/package-brand-kit.py --output design/handoff/2026-10-28
```

Packaging refuses to overwrite an existing release. Human review of artwork,
animation transparency, permissions and credits is still required before use.
