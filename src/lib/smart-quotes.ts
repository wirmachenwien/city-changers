// Locale-aware straight-to-typographic quote conversion.
//
// Source text keeps straight `"` / `'`; rendering maps them per language:
// de/sl: „ “ (‚ ‘), en: “ ” (‘ ’), apostrophe always ’.
// Pure function, no dependencies — shared by the rehype plugin (prose)
// and BaseLayout (frontmatter title bypasses the pipeline).

export type QuoteLang = 'de' | 'en' | 'sl';

interface QuoteSet {
  doubleOpen: string;
  doubleClose: string;
  singleOpen: string;
  singleClose: string;
}

const QUOTES: Record<QuoteLang, QuoteSet> = {
  // German (de-DE) and Slovenian both use low-high quotes.
  de: { doubleOpen: '„', doubleClose: '“', singleOpen: '‚', singleClose: '‘' },
  sl: { doubleOpen: '„', doubleClose: '“', singleOpen: '‚', singleClose: '‘' },
  en: { doubleOpen: '“', doubleClose: '”', singleOpen: '‘', singleClose: '’' },
};

const APOSTROPHE = '’';

export function normalizeLang(lang: string | undefined, fallback: QuoteLang = 'en'): QuoteLang {
  return lang === 'de' || lang === 'en' || lang === 'sl' ? lang : fallback;
}

/** Persistent toggle state so quotes split across inline nodes still pair up. */
export interface QuoteState {
  expectDoubleOpen: boolean;
  expectSingleOpen: boolean;
}

export function createQuoteState(): QuoteState {
  return { expectDoubleOpen: true, expectSingleOpen: true };
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

function isDoubleOpenChar(char: string): boolean {
  return char === '„' || char === '“';
}

function isSingleOpenChar(char: string): boolean {
  return char === '‚' || char === '‘';
}

function isDoubleCloseChar(char: string): boolean {
  return char === '“' || char === '”';
}

function isSingleCloseChar(char: string): boolean {
  return char === '‘' || char === '’';
}

/**
 * Replace straight quotes in a plain-text chunk. Already-typographic
 * characters pass through (and re-sync the toggle, keeping mixed
 * content idempotent). `state` persists across chunks of one page.
 */
export function smartQuotesChunk(
  text: string,
  lang: QuoteLang,
  state: QuoteState = createQuoteState(),
): string {
  const q = QUOTES[lang];
  let out = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    const next = i < text.length - 1 ? text[i + 1] : '';

    if (char === '"') {
      // Context heuristic, alternating toggle as tiebreak.
      const looksOpen = prev === '' || /\s/.test(prev) || '([{—–-–/'.includes(prev);
      const looksClose = next === '' || /\s/.test(next) || '.,;:!?…)]}'.includes(next);
      let open: boolean;
      if (looksOpen && !looksClose) open = true;
      else if (looksClose && !looksOpen) open = false;
      else {
        open = state.expectDoubleOpen;
      }
      out += open ? q.doubleOpen : q.doubleClose;
      state.expectDoubleOpen = !open;
    } else if (char === "'") {
      // Apostrophe between word characters (don't, l'homme) in every language.
      if (isWordChar(prev) && isWordChar(next)) {
        out += APOSTROPHE;
      } else {
        const looksOpen = prev === '' || /\s/.test(prev) || '([{—–-–/„“"'.includes(prev);
        const looksClose = next === '' || /\s/.test(next) || '.,;:!?…)]}'.includes(next);
        let open: boolean;
        if (looksOpen && !looksClose) open = true;
        else if (looksClose && !looksOpen) open = false;
        else {
          open = state.expectSingleOpen;
        }
        out += open ? q.singleOpen : q.singleClose;
        state.expectSingleOpen = !open;
      }
    } else {
      // Existing typographic quotes re-sync the toggle for mixed content.
      if (isDoubleOpenChar(char)) state.expectDoubleOpen = false;
      else if (isDoubleCloseChar(char)) state.expectDoubleOpen = true;
      else if (isSingleOpenChar(char)) state.expectSingleOpen = false;
      else if (isSingleCloseChar(char)) state.expectSingleOpen = true;
      out += char;
    }
  }

  return out;
}

/** Convenience wrapper for one-off strings (titles, meta descriptions). */
export function smartQuotes(text: string, lang: string | undefined, fallback: QuoteLang = 'en'): string {
  return smartQuotesChunk(text, normalizeLang(lang, fallback), createQuoteState());
}
