# Book audio

Static narration for 21 chapters (English, German, Slovenian), plus three M4B
audiobooks. Only explicit generation spends allowance—never builds or playback.

## Quick guide

Run from the repository root. Requires Node ≥22.23.4; assembly also needs FFmpeg
and ffprobe. Keep ElevenLabs credentials in `.env` or exported environment variables.

### 1. Check the text and cost

```sh
npm run audio:plan
npm run audio:proofread
npm run audio:preflight
```

Open `.cache/audio/proofread/index.html` to compare source and exact narration.
Filter **Needs generation** to review changes and available previous scripts.
Preflight checks account allowance and voice access without generating speech.

### 2. Generate only what you need

Example: English chapter 1, with a hard 3,200-character cap:

```sh
npm run audio:generate -- --chapter en/01 --budget 3200
```

Preflight and generation load `.env` automatically; exported values take precedence.
Matching retained audio is reused automatically. Choose a budget from the current
plan; the example is not permission to spend.
Footnotes are read in place, including inline `text` props and flow-level content;
bibliographies and reference/material sections remain text-only.
List items must contain ordinary prose: standalone questions, block wrappers
(such as accordions and pullquotes), and footnote-only items are rejected with
a source-line diagnostic, including in nested lists. Inline footnotes attached
to list prose remain supported. Move standalone components outside the list.
This also applies to standalone `Glossary` components.

- Omit `--chapter` to select the whole book, or use `--units ID,ID` for exact units.
- Add `--plan HASH` to reject unexpected plan changes.
- Interactive runs ask for confirmation; non-interactive runs need `--yes`.

### 3. Prepare a local edition

```sh
npm run audio:prepare -- --chapter en/01  # One chapter: MP3 and cues
npm run audio:prepare -- --language en    # All English chapters + English M4B
npm run audio:prepare                    # Everything: 21 chapters + three M4Bs
```

Preparation is offline: it uses retained narration, makes no paid calls and
uploads nothing. Like the brand kit, audio has a content-addressed release
inventory, separate from the lightweight website payload:

| Location | Contents | Commit? |
| --- | --- | --- |
| `.cache/audio/units/` | Private recordings, original alignments, requests and journals | **Never**; back up privately |
| `.cache/audio/release/` | Assembly intermediates and private provenance | No |
| `public/audio/<revision>/` | Complete local edition: MP3s, M4Bs and cues | Commit only cue JSON (about 0.7 MB); media is ignored |
| `audio/published.json` | Public frontend catalogue; media URLs point to the immutable GitHub Release | Yes, with the edition |
| `audio/release.json` | Complete public attachment inventory and checksums | Yes, with the edition |

Other prepared chapters are preserved. A chapter-only update removes that
language's old M4B link; prepare the whole language to rebuild its audiobook.
Each audiobook also records its metadata identity (localized title, narrator,
author, rights and cover contents). Partial preparations discard preserved books
whose metadata no longer matches, without discarding their chapter tracks.
Releases require the complete catalogue and three audiobooks, not a partial
preparation. Unchanged inputs reuse the same revision and release identity.
Changing a title or replacing cover contents creates a new immutable revision.
Chapter-only preparation needs no audiobook metadata. If shared metadata is
missing, preserved audiobook downloads are invalidated rather than blocking it;
supplied metadata and cover files still undergo normal validation.

Offline encoder settings are not part of narration cache keys. Bitrate changes
re-encode outputs without requesting speech again. Verified older recordings
are matched read-only using their retained generation configuration and voice;
private recordings and journals are not migrated or rewritten. Published script
fingerprints retain their historical schema independently of encoder settings.
Every newly prepared chapter and audiobook records its encoder-settings hash;
books also record their exact ordered chapter IDs. Partial preparation discards
preserved outputs with obsolete settings or book sequences. The existing edition
is supported through the checksum-pinned provenance in `audio/legacy-output.json`,
not by assuming unknown legacy outputs match current settings. No media needs
regenerating solely to add these validation rules.
Generation and preparation share an exclusive lock for the entire operation,
including manifest merges and pruning; a concurrent run fails before changing
release state. A supplied but missing cover remains an editorial error during
preparation. Frontend rendering hides unavailable audiobooks without suppressing
otherwise valid chapter playback.

After a successful manifest update, preparation **automatically deletes stale
managed subfolders** of `public/audio/`. Every revision still referenced by the
merged catalogue is kept, including partial preparations. Unknown files and
symlinks are preserved for manual inspection. Current MP3s/M4Bs remain available
locally. Failed preparation never prunes. Private source clips are never pruned.

### 4. Listen locally

Open the chapter page in the dev server (`astro dev --background`). Check
pronunciation, joins, highlighting, seeking and the three-second reflection pause.
For language/full-book preparation, first set narrator/rights credits and an
existing cover in `audio/config.json`. Each selected chapter must have all its
source clips; missing/corrupt media blocks preparation without replacing the manifest.
Dev automatically uses checksum-verified media from `public/audio/` through
Astro's ordinary static serving, with byte-range support. This includes the
localized frontpage audiobook download. Private source clips and API responses
never enter `public/`. If no verified local copy exists, dev uses the release URL
instead (which only works after publication).
Development caches unchanged plans and validated media, invalidating when source,
configuration, manifests, cover artwork or retained/public assets change. Production
keeps its per-build cache. Failed playback can be retried without reloading the
page: the player reloads failed media and restores the listening cursor.

MP3s/M4Bs are ignored by Git. The `audio-site` integration gives **production
builds only** a filtered public-directory mirror, excluding `audio/**/*.mp3`
and `audio/**/*.m4b` before Vite copies any public assets. Cues,
brand previews and other public files still ship normally. The real local
`public/audio/` handoff remains untouched and is the release uploader's source.

### 5. Validate and publish the reviewed edition

```sh
npm run audio:check           # Offline catalogue/cues/freshness checks
npm run audio:release         # Also verify every public/audio attachment; no network
npm run build
npm run audio:test
```

Review the chapter recordings and manually test M4B import, chapter navigation,
seeking and resume in Apple Books and an Android audiobook player. Automated
container checks do not substitute for those tests.
M4Bs carry the localized book title in both the title and album tags, with a
descriptive language-specific filename. Metadata-only upgrades reuse encoded
AAC streams without quality loss. If Apple Books already imported an older file
as “book”, remove that library entry and import the corrected download again;
its cached title is not updated by publishing a replacement edition.

Commit the reviewed `audio/` inputs, `audio/release.json`, `audio/published.json`
and the matching `public/audio/` cue JSON on a review branch. Push that
branch so the target commit exists on GitHub, then explicitly publish:

```sh
npm run audio:release -- --publish  # Requires gh authentication and committed inputs
npm run audio:release -- --verify   # Existing public release + MP3 ranges; no uploads
```

For the next audio edition, set `audio/edition.json` to a committed date and
same-day revision, for example `{"date":"2026-11-13","revision":0}`. Tags are
`audio-2026-11-13` for that day's first edition, `audio-2026-11-13a` for its
second (`revision: 1`), then `b`, `c`, … (`aa` after `z`). New releases are titled
exactly **City Changers audio**. The complete SHA-256 remains in the inventory,
not in the tag. Advance the date/revision before publishing different content;
the publisher refuses to replace a tag with a different inventory. Explicit
committed dates keep offline builds deterministic rather than changing daily.
The current `name`/`title` edition format remains supported only to verify the
release already published under its legacy descriptive tag; do not republish
merely to rename it. Naming changes do not regenerate speech or alter media.
The publisher uses flat attachment names, paginated lookup, SHA-256/size
verification, resumable draft uploads and `--latest=false`.
Publication holds an OS-backed repository/tag lock shared across local checkouts
from lookup through staging, validation and publication. It fails clearly if
another local publisher holds the lock; process exit automatically releases it.
Uploads never use clobber: matching attachments are verified and skipped, only
missing attachments are uploaded, and mismatched/unknown draft assets stop the
run without deleting anything. This also prevents destructive replacement when
another machine publishes concurrently. GitHub native release immutability is
enabled for new publications as an additional safeguard.
All MP3s, M4Bs, cues and `audio-release.json` are archived in the
release. Only MP3s/M4Bs are loaded from GitHub by the website; cues
remain same-origin. Always use the stable release download URLs, not their
temporary signed redirect targets. No ZIP is needed for the initial edition.

Brand and audio publication share the GitHub transport helpers in
`scripts/github_release.py`, but remain separate inventories: artwork changes
do not republish narration. The brand publisher can use committed originals;
audio uploads explicitly use the complete local `public/audio/` handoff instead
(including the ignored MP3/M4B files, not private assembly intermediates).
There is no paid generation, assembly or upload in normal site builds, dev or CI.
Deployment verifies the committed public release and MP3 range responses before
uploading Pages. Publish an edition **before pushing its manifest to main**;
the deployment gate deliberately rejects unpublished/mismatched releases.
Do not delete the release referenced by `audio/published.json`, nor a brand
release still used by the deployed site. Published release tags are download
addresses, not disposable build caches. Native immutability protects attachments
and tags but does not prevent deletion of an entire release; a deleted immutable
tag cannot be reused. Recovery then requires a new edition date/revision and updated
manifests, using the verified local handoff rather than regenerating narration.
Old GitHub releases are retained, keeping old media URLs valid even when local
public folders are pruned. Tabs using deleted website cues may need a reload.

## Editing later

1. Edit MDX/shared data for source changes, or `audio/overrides.json` for audio-only wording.
2. Rerun plan and proofread; inspect **Needs generation** and previous scripts.
3. Generate the affected chapter or units with a fresh explicit budget.
4. Prepare the chapter or language and listen; prepare the complete edition before
   publishing. Commit its small website artifacts and inventories, publish, then push.

`audio/blocks.json` is the automatically maintained identity ledger; don't edit it
by hand. In-place edits normally preserve IDs; ambiguous edits may get new IDs.
Model/voice changes can invalidate retained audio. After changing voices, use
preflight's hashes to update `voiceHashes` in `audio/config.json` and replan.
Changing `assembly.reflectionPauseSeconds` requires reassembly, not new speech.
Auditioned timing corrections belong in `audio/sentence-timing-corrections.json`:
source-relative seconds, exact sentence text/IDs, source audio SHA-256 and a
review reason. They change edition freshness, not narration cache keys. A changed
source recording or sentence fails closed. Never edit raw provider alignment.

## Safety and useful checks

- Budgets reserve submitted characters before each request and apply cumulatively
  to the same plan, selection, budget and voices. There are **no automatic retries**.
- After a failed/uncertain request or stale lock, reconcile provider usage before
  continuing. Don't delete journals or locks just to retry.
- Pending units and cost are refreshed under the generation lock. Responses
  without exact, structurally valid alignment remain in private `incomplete.json`
  files and cannot become reusable audio; legacy incomplete results are rejected too.
- Provider allowance is read under that same lock, before reserving requests.
  This serializes this checkout's generators, not unrelated consumers of the
  provider account; avoid using the same provider account from multiple machines concurrently.
- Keep `.cache/audio/`: it contains reusable source clips, alignments and journals.
  Back it up privately; never commit credentials, requests or raw provider responses.
- Complete individual chapters can be served independently. Stale or corrupt
  tracks are hidden, and M4Bs require a complete language. Listening never calls ElevenLabs.

Use `npm run audio:plan` for readiness and `npm run audio:test` for offline tests.
Generation/preparation and release commands support `-- --help`. Preparation
validates selected chapters; `audio:check` requires a complete, fresh edition.
CI may use `audio:check -- --allow-missing` for a technical-only checkout with no
edition manifests. If either manifest exists, incomplete/stale editions fail.
