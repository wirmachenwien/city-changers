import { parseHTML } from 'linkedom';

// DrawnSelect uses URL-valued options for navigation. Other selects (such as
// audio playback speed) contain ordinary form values, not link targets.
export function navigationOptionLinks(html) {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll('select[data-select] option[value]')].map(option => option.getAttribute('value'));
}
