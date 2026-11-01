/* Library controls only. Shape decoration is CSS-only, including without JS. */
(() => {
  document.getElementById('theme').addEventListener('click', event => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    event.currentTarget.setAttribute('aria-pressed', String(dark));
  });
  const stage = document.getElementById('shape-previews');
  const width = document.getElementById('shape-width');
  width.addEventListener('input', () => {
    const value = `${width.value}%`;
    stage.style.setProperty('--preview-width', value);
    document.getElementById('shape-width-value').value = value;
  });
  const toggle = document.getElementById('shape-text');
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    stage.querySelectorAll('.extra').forEach(node => { node.hidden = !expanded; });
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Use shorter text' : 'Add longer text';
  });
})();
