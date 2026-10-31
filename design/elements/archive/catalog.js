/* Disk-openable archive catalogue. Never imported by the handbook. */
(() => {
  const groups = {
    lines: ['accent-bar.svg', 'bracket-right.svg', 'bracket.svg', 'divider-dashed.svg', 'divider-short.svg', 'divider-strong.svg', 'divider.svg', 'underline-double.svg', 'underline-long.svg', 'underline-short.svg', 'underline.svg', 'vertical-rule.svg'],
    shapes: ['bubble-tail-left.svg', 'bubble-tail-top.svg', 'frame-nine-slice.svg', 'frame.svg', 'highlight.svg', 'label-long.svg', 'label-outline.svg', 'label-short.svg', 'label.svg', 'pebble-outline.svg', 'pebble-round.svg', 'pebble-tall.svg', 'pebble.svg'],
    variations: ['accent-bar-medium-lively.svg', 'accent-bar-medium-natural.svg', 'accent-bar-short-gentle.svg', 'accent-bar-short-lively.svg', 'accent-bar-tall-gentle.svg', 'accent-bar-tall-lively.svg', 'divider-strong-wide-gentle.svg', 'divider-strong-wide-lively.svg', 'divider-wide-gentle.svg', 'divider-wide-lively.svg', 'vertical-rule-medium-lively.svg', 'vertical-rule-medium-natural.svg', 'vertical-rule-short-gentle.svg', 'vertical-rule-short-lively.svg', 'vertical-rule-tall-gentle.svg', 'vertical-rule-tall-lively.svg'],
  };
  const catalog = document.getElementById('catalog');
  catalog.innerHTML = Object.entries(groups).map(([folder, files]) => `<section><h2>${folder === 'lines' ? 'Original lines' : folder === 'shapes' ? 'Original shapes' : 'Unselected stroke variations'}</h2><ul>${files.map(file => `<li><img src="${folder}/${file}" alt=""><a href="${folder}/${file}" download>${file}</a></li>`).join('')}</ul></section>`).join('');
  document.getElementById('theme').addEventListener('click', event => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    event.currentTarget.setAttribute('aria-pressed', String(dark));
  });
})();
