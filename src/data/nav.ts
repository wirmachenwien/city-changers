// Project navigation. Canonical data lives in nav.json (editable via
// PagesCMS); this module validates it and exposes typed access.
import { z } from 'zod';
import { languages } from '../../handbook.config.ts';
import raw from './nav.json';
import type { Language } from './locales';

const navItemSchema = z.object({
  label: z.string(),
  file: z.string(),
  /** Virtual pages (e.g. the book contents sheet) carry a label here but
   *  render via the book navigation, not the project navigation. */
  nav: z.boolean().optional().default(true),
});
export type NavItem = z.infer<typeof navItemSchema>;

type Nav = Record<Language, NavItem[]>;

const parsedNav = z.record(z.string(), z.array(navItemSchema)).parse(raw) as Record<string, NavItem[]>;
for (const lang of languages) {
  if (!parsedNav[lang]) throw new Error(`nav.json: missing navigation "${lang}" (see handbook.config.ts)`);
}

export const nav: Nav = parsedNav as Nav;

/** Label of the virtual book contents page (no MDX source file; the label
 *  lives in nav.json next to the other virtual-page labels). */
export function contentsLabel(lang: Language): string {
  const label = nav[lang].find((item) => item.file === 'book/contents')?.label;
  if (!label) throw new Error(`nav.json: missing "book/contents" label for "${lang}"`);
  return label;
}
