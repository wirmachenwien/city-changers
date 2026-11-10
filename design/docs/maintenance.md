# Maintaining the brand library

## Ownership and edit points

| Location | Responsibility |
| --- | --- |
| `design/brand-guide.mdx` | Sole brand-guide source, including component examples, for the website, Pages CMS and handoff |
| `design/manifest.json` | Shared inventory of application assets for website downloads and the handoff |
| `design/assets/logo/logo-lockup.svg` | Sole editable full-logo master; never overwritten by generation |
| `src/assets/site/` | Derived logos, application lockup copy, PNGs, link preview and supporting marks |
| `design/assets/mascot/source/poses.json` | Base pose definitions consumed by motion and stills |
| `design/assets/mascot/source/static-poses.json` | Static-only overrides and additional poses; never consumed by motion |
| `src/assets/mascot/` | Stills, preview sheet, Lottie and transparent MOV exports |
| `src/assets/fonts/` | Fonts with their OFL notices |
| `src/assets/book/` | Handbook reference images |
| `public/` | Generated web icons and `site.webmanifest` derived from handbook config |
| `design/motion/` | Editable animation code and Studio defaults |
| `design/docs/handoff/START-HERE.txt` | Recipient workflow instructions, not a second brand guide |

Application assets live directly at their normal codebase paths; there is no
parallel media library in `design/assets/`. Fonts, handbook images and supporting
marks are edited in `src/assets/`, including through the CMS. Logos, mascot media
and web icons are generated there (or in `public/`) from their design sources.
`public/brand-assets/` contains disposable release-link metadata and lightweight
website previews, not original downloads or an independent source library.

`design/assets/logo/logo-lockup.svg` is the sole editable logo master and the
source for every derived logo and web icon. Generation copies it unchanged to
`src/assets/site/logo-lockup.svg` for application use; never edit that copy.
The still-mascot generator reads the derived `src/assets/site/logo.svg`.
The six animated rigs intentionally retain independent part instances so Studio
can save edits to one animation without changing the other five. Static pose
rebuilds do not rewrite separately authored animation paths.

## Local generation and committed outputs

```sh
pip install -r design/requirements.txt
npm run design:plan
npm run design:build
npm run design:check
python3 -m unittest discover -s design/tests -v
```

Do not re-render videos unless the user explicitly requests it. Inspect the plan
first; for static-only changes run `python3 design/scripts/build-design.py --stills`
rather than a broad build that includes video groups. Static-only pose overrides
do not invalidate animations. Existing video exports must remain unchanged.

Node is needed only when an animation product must be rebuilt. The pipeline
installs the motion project's locked dependencies with `npm ci` on demand.
Use the root Node engine requirement (22.23.4 or newer, subject to motion's engine
constraint). Image tools are pinned in `design/requirements.txt`; packaging uses
Python's standard library and website thumbnails use Pillow. The contact sheet uses our bundled font
rather than an operating-system font.

The local generator fingerprints both inputs and outputs, rather than modification
times. `npm run design:build` rebuilds stale products and updates the tracked
`design/build-state.json` record after successful generation. Commit that record
with the changed sources and generated files, after reviewing the artwork.
Missing, changed or corrupt outputs are rebuilt locally even if sources did not
change. Old ignored build-state caches are never used for freshness checks.

- Logo-source changes rebuild identity exports, icons and stills.
- Base pose changes rebuild stills and all affected animation products; static-only
  overrides rebuild just stills.
- An action's component/rig changes rebuild that action's two Lotties and two MOVs.
- Shared motion/defaults/toolchain changes conservatively rebuild all animations.
- Lottie-exporter changes rebuild Lottie, not MOV.
- Guide, photo, font or inventory changes refresh only dependent products and
  delivery copies. The still contact sheet depends on Clarity City Regular.

## CI validation and automatic packaging

Design validation is change-aware (`scripts/bin/ci-design-scope.mjs`). Motion
sources, shared pose definitions and toolchain/workflow changes run motion lint
and tests. Design sources, assets, packaging and test edits run the full design
suite. Unrelated prose/UI edits retain freshness, lightweight pipeline/release
tests and all export/brand-guide checks, without installing motion dependencies.
PRs compare the tested merge commit with its base; pushes compare the previous
tip, fetching that single commit if necessary. Missing history falls back to
full validation. Manual CI/deploy runs always validate everything.

`npm run design:check` checks the committed record without changing any files.
`npm run design:prepare` performs the same check, then refreshes release-link
metadata and small SVG/WebP previews in `public/brand-assets/`. It neither
packages a ZIP nor copies original downloads into the website. Install
`design/requirements.txt` before preparing previews.

Normal website builds and development startup call `design:prepare`, never the
artwork generator. Stale assets fail with instructions to regenerate locally and
commit the updated sources, assets and record together. CI explicitly refuses
artwork generation, restores no artwork cache and does not update the record.

Pull-request checks and deployment validate
the committed artwork. Regression tests
may render disposable fixtures, but never regenerate committed assets. CI checks
that tracked design/application assets remain unchanged. The deployed website
and ZIP therefore use the same asset versions as Git, with no bot commits.

Generated artwork still requires artistic review and rights approval before use.

## Handbook PDF/EPUB exports

`npm run build:downloads` publishes only the final PDFs and EPUBs in
`dist/downloads/`. Intermediate print HTML used by WeasyPrint and the rendered
regression tests is written to `dist-pdf/` (gitignored); stale `.html` files in
`dist/downloads/` are removed during every build so they are never uploaded to
Pages.

EPUB packaging bounds raster payloads without touching the approved originals:
figures embed a derivative at 2x their display width, large packaged images
(covers) are capped at 1600 px, JPEGs use quality 82 and PNGs stay PNG. The same
source and width reuse one cached derivative, so a photo used as cover and in
two figures is no longer embedded at camera resolution three times. PDFs keep
the full-resolution source images for print quality.

## Preview and release

The website's `/brand` renders the sole Markdown guide and
lists downloads from the same manifest as the ZIP. It stays out of navigation,
Pagefind and the sitemap, with `noindex` and no analytics. This is not access
control. The downloadable files are public too; add authentication separately
if confidential material is ever introduced.

Deployments run `design/scripts/publish-brand-release.py` after validation and
before Pages upload. A SHA-256 of the complete inventory and packaging inputs
identifies the release. Existing published releases are verified and reused;
only new inputs cause ZIP packaging and attachment uploads. Individual originals
use flat, category-prefixed attachment names; the ZIP retains its original folder
structure. Publication uses a draft until all attachments pass checksum checks.
The guide is pinned to that inventory's release, so later unrelated software
releases cannot redirect its download links. See `design/README.md` for rollout.

For an immutable recipient folder and ZIP, first run the incremental build,
then package to a fresh output directory:

```sh
python3 design/scripts/package-brand-kit.py --output design/handoff/2026-10-28
```

The kit has one top-level folder, a browser-readable start page, plain-text
instructions, the exact brand-guide Markdown, font licences, and an inventory
with canonical source paths and SHA-256 hashes. No source code, dependencies,
scratch renders or old ZIPs are included. Existing releases are not overwritten.

Before publication:

- Preview logos, all seven still poses, and twelve animations in each format.
- Check MOV alpha in a compatible editor and Lottie playback in the target app.
- Review font notices and individual photo/partner-mark permissions and credits.
- Open the ZIP independently and check its start page and guide.
- Do not treat the repository licence as blanket photo/trademark clearance.

Supporting photos and partner marks are reference material, not a cleared stock
library. Check creator credits, permissions and third-party mark rules before
reuse; a repository licence or CC badge alone does not establish clearance.

For specialist source handoffs, preserve the repository-relative layout of
`design/motion/`, `design/assets/` and the required `src/assets/` files, excluding
dependencies, scratch output and caches.
Include the repository licence and review Remotion's separate commercial terms.
