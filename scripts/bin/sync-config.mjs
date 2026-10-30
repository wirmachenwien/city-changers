#!/usr/bin/env node
// Regenerates the files derived from handbook.config.ts (single source of
// truth) that cannot import it directly because an external tool owns them:
// - .pages.yml (PagesCMS content model: one chapters/home/metadata section
//   per language, previously 3x copy-paste)
// - public/robots.txt (absolute sitemap URL: site + base)
// - public/site.webmanifest (icon URLs carry the base subpath)
//
// Run `npm run sync:config` after changing handbook.config.ts; CI runs
// `npm run check:config` (--check) to make sure the committed files are
// in sync.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { site, base, languages, languageNames, defaultLang, themeColor } from '../../handbook.config.ts';
import { normalizeBase } from '../lib/paths.mjs';

const LANGS = [...languages];
const BASE_PATH = normalizeBase(base);
const WORKS = JSON.parse(readFileSync('src/data/works.json', 'utf8'));
const LOCALES = JSON.parse(readFileSync('src/data/locales.json', 'utf8'));

const displayName = (lang) => languageNames[lang] ?? lang;
const nativeName = (lang) => LOCALES[lang]?.['local-name'] ?? displayName(lang);
const yamlString = (value) => JSON.stringify(String(value));
const indentBlock = (text, spaces) => text.split('\n').map((line) => line ? `${' '.repeat(spaces)}${line}` : line).join('\n');

function pagesCollection(lang) {
  return `      - name: pages_${lang}
        label: Pages
        type: collection
        path: src/content/pages/${lang}
        format: yaml-frontmatter
        filename:
          template: "{primary}.mdx"
          field: create
        view:
          primary: title
        fields:
          - name: title
            type: string
            required: true
          - name: lang
            component: language
          - name: template
            component: page_template
          - name: openerImage
            label: Opener image
            type: image
            options:
              media: book_images
              path: src/assets/book
          - name: openerImageAlt
            label: Opener image alt text
            type: text
          - name: body
            component: markdown_body
            options:
              media: site_images
              path: src/assets/site
              rename: safe
`;
}

function chaptersCollection(lang) {
  return `      - name: chapters_${lang}
        label: Chapters
        type: collection
        path: src/content/book/${lang}
        format: yaml-frontmatter
        filename:
          template: "{primary}.mdx"
          field: create
        view:
          primary: title
        fields:
          - name: title
            label: Page title
            type: string
            required: true
          - name: lang
            component: language
          - name: template
            component: book_template
          - name: body
            component: markdown_body
            options:
              media: book_images
              path: src/assets/book
              rename: safe
`;
}

function appSettings() {
  return `      - name: app_settings
        label: Site and PDF settings
        type: file
        path: src/data/settings.json
        format: json
        operations:
          create: false
          delete: false
        fields:
          - name: downloads
            label: Download settings
            type: object
            fields:
              - name: pdf
                label: Generate PDF downloads
                type: boolean
              - name: epub
                label: Generate EPUB downloads
                type: boolean
          - name: web
            label: Website settings
            type: object
            fields:
              - name: pagination
                type: boolean
              - name: paginationType
                label: Pagination type
                type: select
                options:
                  values:
                    - name: title-arrows
                      label: Title and arrows
                    - name: arrows
                      label: Arrows only
                    - name: titles
                      label: Titles only
                    - name: previous-next
                      label: Previous and next
              - name: collapsibleSections
                label: Collapsible sections
                type: select
                options:
                  values:
                    - name: none
                      label: No automatic collapsing
                    - name: h2
                      label: Collapse H2 sections
                    - name: h3
                      label: Collapse H3 sections
                    - name: h4
                      label: Collapse H4 sections
                    - name: h5
                      label: Collapse H5 sections
              - name: bookmarks
                type: object
                fields:
                  - name: enabled
                    type: boolean
              - name: nav
                label: Navigation behavior
                type: object
                fields:
                  - name: expandBooks
                    type: boolean
                  - name: projectNavPosition
                    type: select
                    options:
                      values:
                        - name: before
                          label: Before book navigation
                        - name: after
                          label: After book navigation
              - name: search
                type: object
                fields:
                  - name: param
                    label: Search query parameter
                    type: string
              - name: titleDivider
                label: Title divider
                type: string
              - name: indexing
                label: Search engine indexing
                type: boolean
          - name: pdf
            label: PDF settings
            type: object
            fields:
              - name: notes
                label: Note placement
                type: select
                options:
                  values:
                    - name: footnotes
                      label: Footnotes, bottom of page
                    - name: chapter-footnotes
                      label: End of chapter
                    - name: book-footnotes
                      label: End of book
              - name: page
                label: Page setup
                type: object
                fields:
                  - name: size
                    type: string
                  - name: margin
                    type: string
`;
}

function sharedProjectSettings() {
  return `  - name: project_settings
    label: Project Settings
    type: group
    items:
${sharedProjectMetadata()}
${appSettings()}`;
}

// One shared, language-independent file: the partner marks render on every
// home page, in the footer and on the book title page. `list: true` makes
// PagesCMS treat the file itself as a top-level array.
function partnersFile() {
  return `  - name: partners
    label: Partner organisations
    type: file
    path: src/data/partners.json
    format: json
    list: true
    operations:
      create: false
      delete: false
    fields:
      - name: name
        label: Name
        description: Used as the alt text of the mark.
        type: string
        required: true
      - name: href
        label: Website
        type: string
        required: true
      - name: src
        label: Logo
        description: Pick a mark from the canonical partner and credit marks library.
        type: image
        required: true
        options:
          media: site_images
          path: src/assets/site
          extensions: [svg, png]
      - name: width
        label: Width (px)
        description: Intrinsic pixel width of the logo file. Sets the aspect ratio in HTML; the PDF/EPUB title page sizes the mark from it.
        type: number
        required: true
        options:
          min: 1
      - name: height
        label: Height (px)
        description: Intrinsic pixel height of the logo file.
        type: number
        required: true
        options:
          min: 1
      - name: mod
        label: Style modifier
        description: CSS class suffix (partner-logos__logo--…) for marks that need a different height. Leave empty for the default.
        type: string
`;
}

function sharedProjectMetadata() {
  return `      - name: project_metadata
        label: Project metadata
        type: file
        path: src/data/project.json
        format: json
        operations:
          create: false
          delete: false
        fields:
          - name: creator
            type: string
          - name: contributor
            type: string
          - name: publisher
            type: string
          - name: rights
            type: text
          - name: date
            type: string
          - name: modified
            type: string
          - name: identifier
            type: string
`;
}

function languageMetadata(lang) {
  return `          - name: metadata_${lang}
            label: Metadata
            type: file
            path: src/data/works.json
            format: json
            operations:
              create: false
              delete: false
            fields:
${indentBlock(metadata(lang), 4)}`;
}

function metadata(lang) {
  const display = displayName(lang);
  return `          - name: ${lang}
            label: ${display} metadata
            type: object
            fields:
              - name: title
                label: Title
                type: string
                required: true
              - name: subtitle
                type: string
              - name: description
                label: Description
                type: text
              - name: credit
                label: Credit
                type: text
              - name: language
                type: string
              - name: type
                type: string
              - name: subject
                type: string
`;
}

function languageSection(lang) {
  return `  - name: language_${lang}
    label: ${yamlString(nativeName(lang))}
    type: group
    items:
      - name: project_settings_${lang}
        label: Language Settings
        type: group
        items:
${languageMetadata(lang)}
${navigationFile(lang)}
${localeFile(lang)}
${glossaryFile(lang)}
${pagesCollection(lang)}
${chaptersCollection(lang)}`;
}

function navigationFile(lang) {
  return `          - name: navigation_${lang}
            label: Navigation
            type: file
            path: src/data/nav.json
            format: json
            operations:
              create: false
              delete: false
            fields:
${indentBlock(navigation(lang), 4)}`;
}

function localeFile(lang) {
  return `          - name: locale_strings_${lang}
            label: UI translations
            type: file
            path: src/data/locales.json
            format: json
            operations:
              create: false
              delete: false
            fields:
${indentBlock(localeStrings(lang), 4)}`;
}

function glossaryFile(lang) {
  return `      - name: glossary_${lang}
        label: Glossary
        type: file
        path: src/data/glossary.json
        format: json
        operations:
          create: false
          delete: false
        fields:
${indentBlock(glossary(lang), 0)}`;
}

function navigation(lang) {
  const display = displayName(lang);
  return `          - name: ${lang}
            label: ${display} navigation
            type: object
            list: true
            fields:
              - name: label
                type: string
                required: true
              - name: file
                type: string
                required: true
              - name: nav
                label: Show in main navigation
                description: Virtual pages (e.g. the book contents sheet) carry a label here but render via the book navigation. Leave on for header/footer links.
                type: boolean
                required: false
                default: true
`;
}

function glossary(lang) {
  const display = displayName(lang);
  return `          - name: ${lang}
            label: ${display} glossary
            type: object
            list: true
            fields:
              - name: term
                label: Term
                type: string
                required: true
              - name: definition
                label: Definition
                type: text
                required: true
              - name: forms
                label: Word forms
                description: Additional inflected forms found in the chapters (plurals, cases). Leave empty to match the term itself.
                type: string
                list: true
`;
}

function localeStrings(lang) {
  const display = displayName(lang);
  return `          - name: ${lang}
            label: ${display} UI strings
            type: object
            fields:
              - name: direction
                type: select
                options:
                  values:
                    - name: ltr
                      label: Left to right
                    - name: rtl
                      label: Right to left
              - name: local-name
                label: Local language name
                type: string
              - name: nav
                label: Navigation labels
                type: object
                fields:
                  - name: breadcrumb
                    type: string
                  - name: menu
                    type: string
                  - name: next
                    type: string
                  - name: previous
                    type: string
                  - name: toc
                    type: string
              - name: input
                label: Input labels
                type: object
                fields:
                  - name: submit
                    type: string
                  - name: close
                    type: string
              - name: errors
                label: Error labels
                type: object
                fields:
                  - name: page-not-found
                    type: string
              - name: search
                label: Search labels
                type: object
                fields:
                  - name: search-title
                    label: Search title
                    type: string
                  - name: placeholder
                    type: string
                  - name: placeholder-searching
                    label: Searching placeholder
                    type: string
                  - name: search-results
                    label: Search results heading
                    type: string
                  - name: results-for-singular
                    type: string
                  - name: results-for-plural
                    type: string
                  - name: results-for-none
                    type: string
              - name: questions
                label: Question labels
                type: object
                fields:
                  - name: check-answers-button
                    type: string
                  - name: correct-answers
                    type: string
                  - name: feedback-correct
                    type: string
                  - name: feedback-incorrect
                    type: string
                  - name: feedback-unfinished
                    type: text
              - name: cross-references
                label: Cross-reference labels
                type: object
                fields:
                  - name: pre-page-number
                    type: string
                  - name: post-page-number
                    type: string
              - name: bookmarks
                label: Bookmark labels
                type: object
                fields:
                  - name: bookmark
                    type: string
                  - name: set-bookmark
                    type: string
                  - name: remove-bookmark
                    type: string
                  - name: bookmarks
                    type: string
                  - name: last-location-prompt
                    type: string
                  - name: delete-bookmark
                    type: string
              - name: controls
                label: Control labels
                type: object
                fields:
                  - name: language-select
                    type: string
                  - name: choose-chapter
                    type: string
              - name: theme
                label: Theme labels
                type: object
                fields:
                  - name: theme
                    type: string
                  - name: system
                    type: string
                  - name: light
                    type: string
                  - name: dark
                    type: string
              - name: metadata
                label: Metadata labels
                type: object
                fields:
                  - name: title
                    type: string
                  - name: subtitle
                    type: string
                  - name: creator
                    type: string
                  - name: contributor
                    type: string
                  - name: publisher
                    type: string
                  - name: language
                    type: string
                  - name: identifier
                    type: string
                  - name: description
                    type: string
              - name: video
                label: Video labels
                type: object
                fields:
                  - name: video-title
                    type: string
                  - name: play-video
                    type: string
              - name: copy
                label: Copy labels
                type: object
                fields:
                  - name: copy
                    type: string
                  - name: copied
                    type: string
                  - name: copy-failed
                    type: string
              - name: share
                label: Share labels
                type: object
                fields:
                  - name: share
                    type: string
                  - name: link
                    type: string
                  - name: email
                    type: string
                  - name: bluesky
                    type: string
                  - name: facebook
                    type: string
                  - name: linkedin
                    type: string
                  - name: reddit
                    type: string
                  - name: twitter
                    type: string
                  - name: whatsapp
                    type: string
              - name: expandable-box
                label: Expandable-box labels
                type: object
                fields:
                  - name: read-more
                    type: string
              - name: spoiler
                label: Spoiler labels
                type: object
                fields:
                  - name: show
                    type: string
                  - name: hide
                    type: string
              - name: headings
                label: Heading labels
                type: object
                fields:
                  - name: link-to-section
                    type: string
              - name: footnotes
                label: Footnote labels
                type: object
                fields:
                  - name: notes
                    type: string
                  - name: back-to-text
                    type: string
                  - name: open
                    type: string
                  - name: close
                    type: string
              - name: slideshow
                label: Slideshow labels
                type: object
                fields:
                  - name: slides
                    type: string
              - name: visual-toc
                label: Visual table-of-contents labels
                type: object
                fields:
                  - name: link-to-page-assistive-text
                    type: string
`;
}

function languageOptions() {
  return LANGS.map((lang) => `        - name: ${lang}
          label: ${yamlString(nativeName(lang))}
`).join('');
}

function brandGuide() {
  return `  - name: brand_guide
    label: Brand Guide
    type: file
    path: design/brand-guide.mdx
    format: yaml-frontmatter
    fields:
      - name: title
        type: string
        readonly: true
      - name: lang
        component: language
        readonly: true
      - name: body
        component: markdown_body
        description: "Published at ${site}${BASE_PATH}/brand. The complete guide, including all live component examples. The Colors section is generated; update design/colors.json and run npm run colors:generate instead of editing that section here."
    operations:
      create: false
      delete: false
`;
}

function pagesYml() {
  return `# GENERATED from handbook.config.ts — do not edit by hand.
# Run \`npm run sync:config\` to regenerate.
media:
  - name: book_images
    label: Book images
    input: src/assets/book
    output: src/assets/book
    categories: [image]
    rename: safe
  - name: site_images
    label: Site images
    input: src/assets/site
    output: src/assets/site
    categories: [image]
    rename: safe

settings:
  content:
    merge: true
  commit:
    identity: app
    templates:
      create: "content: create {path}"
      update: "content: update {path}"
      delete: "content: delete {path}"
      rename: "content: rename {oldPath} to {newPath}"

components:
  markdown_body:
    label: Body
    type: code
    options:
      format: mdx
  book_template:
    label: Template
    type: select
    options:
      values:
        - name: chapter
          label: Chapter
        - name: section
          label: Section
  page_template:
    label: Template
    type: select
    options:
      values:
        - name: home
          label: Home
        - name: page
          label: Content page
        - name: search
          label: Search page
  language:
    label: Language
    type: select
    options:
      values:
${languageOptions()}
content:
${sharedProjectSettings()}
${partnersFile()}
${LANGS.map((lang) => languageSection(lang)).join('\n')}
${brandGuide()}`;
}

function robotsTxt() {
  return `User-agent: *
Disallow: ${BASE_PATH}/brand$
Disallow: ${BASE_PATH}/brand?
Disallow: ${BASE_PATH}/brand/
Disallow: ${BASE_PATH}/brand.html

Sitemap: ${site}${base}sitemap.xml
`;
}

function webmanifest() {
  const manifestName = WORKS[defaultLang]?.title;
  return `{
  "name": ${JSON.stringify(manifestName)},
  "short_name": ${JSON.stringify(manifestName)},
  "icons": [
    { "src": "${BASE_PATH}/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "${BASE_PATH}/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": ${JSON.stringify(themeColor)},
  "background_color": ${JSON.stringify(themeColor)},
  "display": "standalone"
}
`;
}

const targets = [
  { path: '.pages.yml', render: pagesYml },
  { path: 'public/robots.txt', render: robotsTxt },
  { path: 'public/site.webmanifest', render: webmanifest },
];

function fail(message) {
  console.error(message);
  return 1;
}

function validatePagesYml() {
  const source = readFileSync('.pages.yml', 'utf8');
  const doc = parseDocument(source, { prettyErrors: true, uniqueKeys: true });
  if (doc.errors.length > 0) {
    for (const error of doc.errors) console.error(error.message);
    return 1;
  }
  const config = doc.toJSON();
  if (!Array.isArray(config?.content)) return fail('.pages.yml: content must be a list');

  const names = [];
  const contentPaths = [];
  let mdxFiles = 0;
  let mdxFrontmatterEditors = 0;
  let hasImageField = false;
  let hasMdxCodeBody = false;

  function visitFields(fields) {
    if (!Array.isArray(fields)) return;
    for (const field of fields) {
      if (field?.type === 'image') hasImageField = true;
      if (field?.name === 'body' && field?.component === 'markdown_body') hasMdxCodeBody = true;
      visitFields(field?.fields);
    }
  }

  function visitItems(items) {
    for (const item of items) {
      if (!item?.name) return fail('.pages.yml: every content item needs a name');
      names.push(item.name);
      if (typeof item.path === 'string') {
        if (item.path.startsWith('src/content/') || item.path.startsWith('src/data/')) {
          contentPaths.push(item.path);
        }
        if (item.path.startsWith('src/content/') && item.path.endsWith('.mdx')) {
          mdxFiles += 1;
          if (item.format === 'yaml-frontmatter') mdxFrontmatterEditors += 1;
        }
        if (item.type === 'collection' && item.path.startsWith('src/content/')) {
          mdxFiles += 1;
          if (item.format === 'yaml-frontmatter') mdxFrontmatterEditors += 1;
        }
      }
      visitFields(item.fields);
      if (Array.isArray(item.items)) {
        const nested = visitItems(item.items);
        if (nested) return nested;
      }
    }
    return 0;
  }

  const itemError = visitItems(config.content);
  if (itemError) return itemError;

  const duplicateNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (duplicateNames.length > 0) return fail(`.pages.yml: duplicate content item name(s): ${duplicateNames.join(', ')}`);

  const duplicatePaths = [...new Set(contentPaths.filter((path, index) => contentPaths.indexOf(path) !== index))];
  if (duplicatePaths.length > 0) {
    console.warn(`.pages.yml: repeated content/data path(s): ${duplicatePaths.join(', ')}`);
  }
  if (mdxFiles === 0) return fail('.pages.yml: no MDX content files configured');
  if (mdxFiles !== mdxFrontmatterEditors) {
    return fail(`.pages.yml: expected all ${mdxFiles} MDX files to use yaml-frontmatter, got ${mdxFrontmatterEditors}`);
  }
  if (!hasImageField) return fail('.pages.yml: no image field configured');
  if (!hasMdxCodeBody) return fail('.pages.yml: no MDX body field configured');
  console.log(`valid: .pages.yml (${names.length} content items, ${mdxFiles} MDX editors)`);
  return 0;
}

const checkOnly = process.argv.includes('--check');
let dirty = 0;
for (const { path, render } of targets) {
  const next = render();
  const current = readFileSync(path, 'utf8');
  if (current === next) {
    console.log(`${checkOnly ? 'in sync' : 'unchanged'}: ${path}`);
    continue;
  }
  dirty += 1;
  if (checkOnly) {
    console.error(`OUT OF SYNC: ${path} (run npm run sync:config)`);
  } else {
    writeFileSync(path, next);
    console.log(`wrote ${path}`);
  }
}
if (checkOnly) dirty += validatePagesYml();
if (checkOnly && dirty > 0) process.exit(1);
