/** Plain text only, including old saved titles that contain serialized HTML. */
export function plainBookmarkText(value: string): string {
  let previous: string;
  do {
    previous = value;
    const template = document.createElement('template');
    template.innerHTML = value;
    template.content.querySelectorAll('script, style, noscript, template, svg, iframe').forEach(node => node.remove());
    template.content.querySelectorAll('br, p, div, li').forEach(node => node.append(' '));
    value = [...template.content.childNodes].map(node => node.textContent ?? '').join('').replace(/\s+/g, ' ').trim();
  } while (value !== previous);
  return value;
}

/** Read visible editorial text, never embed fallbacks, controls or SVG titles. */
function text(element: Element | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(
    'script, style, noscript, template, svg, iframe, [hidden], [aria-hidden="true"], ' +
    'button:not(.definition-term), input, select, textarea, [data-heading-anchor], ' +
    '[data-feedback], .slide-nav, .mascot-box__visual',
  ).forEach(node => node.remove());
  clone.querySelectorAll('br, p, div, li').forEach(node => node.append(' '));
  return plainBookmarkText(clone.textContent ?? '');
}

type Labels = Record<'video' | 'image' | 'slideshow' | 'table' | 'quote' | 'tip' | 'accordion' | 'copy' | 'qr', string>;

/** Component-specific bookmark titles; ordinary prose keeps a short excerpt. */
export function bookmarkExcerpt(element: HTMLElement, labels: Labels, maxWords = 25): string {
  const caption = () => text(element.querySelector('figcaption'));
  const labelled = (kind: keyof Labels, value: string) => value ? `${labels[kind]}: ${value}` : labels[kind];
  let title: string;
  if (element.matches('[data-video]')) {
    title = labelled('video', caption());
  } else if (element.matches('[data-slides]')) {
    title = labelled('slideshow', plainBookmarkText(element.getAttribute('aria-label') ?? '') || caption());
  } else if (element.matches('.qr')) {
    title = labelled('qr', caption() || plainBookmarkText(element.querySelector('[role="img"]')?.getAttribute('aria-label') ?? ''));
  } else if (element.matches('figure') || (element.querySelector('img') && !text(element))) {
    title = labelled('image', caption() || plainBookmarkText(element.querySelector('img')?.getAttribute('alt') ?? ''));
  } else if (element.matches('[data-quiz]')) {
    title = text(element.querySelector('legend'));
  } else if (element.matches('.table-scroll, table')) {
    const headers = [...element.querySelectorAll('thead th')].map(cell => text(cell)).filter(Boolean).join(' / ');
    title = labelled('table', text(element.querySelector('caption')) || headers);
  } else if (element.matches('.feature-box, .mascot-box')) {
    title = labelled('tip', text(element.querySelector('.feature-box__title, .mascot-box__title')) || text(element));
  } else if (element.matches('details')) {
    title = labelled('accordion', text(element.querySelector('summary')));
  } else if (element.matches('blockquote')) {
    title = labelled('quote', text(element.querySelector('p')) || text(element));
  } else if (element.matches('[data-copy]')) {
    title = labelled('copy', plainBookmarkText(element.getAttribute('data-copy') ?? ''));
  } else {
    title = text(element);
  }
  return title.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
}
