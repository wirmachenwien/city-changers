import { parseHTML } from 'linkedom';

// Only navigation lists use URL-valued options. DrawnSelect is also the visual
// shell for ordinary form values such as audio playback speed.
export function navigationOptionLinks(html) {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll('[data-select-list] select[data-select] option[value]')].map(option => option.getAttribute('value'));
}
