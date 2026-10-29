// Handbook site configuration — the single source of truth.
//
// site, base, slug, languages, defaultLang and themeColor are defined exactly once here.
// Everything else derives from them:
// - astro.config.mjs (site, base, default-language redirects)
// - src/lib/site.ts (SITE_URL, BASE_PATH, DEFAULT_LANG, URL helpers)
// - src/data/locales.ts (languages, Language)
// - src/content.config.ts (content language enum)
// - Python builders (argparse choices, download stem)
// - scripts/bin/check-site.mjs, scripts/bin/fix-dist.mjs
// - scripts/bin/sync-config.mjs -> .pages.yml, public/robots.txt, public/site.webmanifest
//
// To ship a two-language handbook, shrink `languages` (keeping defaultLang
// inside it) and run `npm run sync:config`, then rebuild.

import colors from './src/data/colors.generated.json' with { type: 'json' };

/** Canonical origin the site is published at. */
export const site = 'https://toolbox.wirmachen.wien';

/** Project subpath (Astro form, with leading and trailing slash). */
export const base = '/';

/** Filename stem for the generated PDF/EPUB downloads: `<slug>-<lang>.pdf`. */
export const slug = 'toolbox-city-changer';

/** Every handbook language. The first entry is only a display default;
 *  URL treatment is decided by `defaultLang` below. */
export const languages = ['de', 'en', 'sl'] as const;

/** Display names for the CMS config generator (scripts/bin/sync-config.mjs). */
export const languageNames = { de: 'German', en: 'English', sl: 'Slovene' } as const;

export type Language = (typeof languages)[number];

/** Language served without a URL prefix (/ and /book/); the rest live
 *  under /<lang>/ and /book/<lang>/. Must be a member of `languages`. */
export const defaultLang: Language = 'en';

/** Chrome / safe-area background: paper tone. Single source for the
 *  theme-color metas (BaseLayout), site.webmanifest (via sync-config.mjs),
 *  and the generated CSS tokens, all sourced from design/colors.json.
 *  themeColor stays as the light default for backwards compatibility. */
export const themeColor = colors.themes.light.paper;

/** Light chrome background (default paper). */
export const themeColorLight = themeColor;

/** Dark chrome background (dark --paper). */
export const themeColorDark = colors.themes.dark.paper;

/** Plausible analytics (self-hosted instance, privacy-friendly, cookieless).
 *  Configured at build time via environment so no tracker URL is hardcoded:
 *  - PLAUSIBLE_DOMAIN: site identifier registered in Plausible (data-domain).
 *  - PLAUSIBLE_SCRIPT_SRC: full script URL on the self-hosted instance, e.g.
 *    the site-specific `pa-….js` URL from the installation snippet.
 *    Configure downloads/outbound links in Plausible's tracking settings.
 *  Empty values disable tracking (dev default, and safe until configured).
 *  This module is also bundled for the browser (via src/lib/site.ts), where
 *  `process` does not exist — hence the guarded access. */
const nodeEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

export const plausible = {
  domain: nodeEnv.PLAUSIBLE_DOMAIN ?? '',
  scriptSrc: nodeEnv.PLAUSIBLE_SCRIPT_SRC ?? '',
};
