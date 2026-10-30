/** Build two levels from the guide outline, never from embedded live demos. */
export function initBrandToc(): void {
  const nav = document.querySelector<HTMLElement>('[data-scroll-toc]');
  const list = nav?.querySelector('ul');
  const content = document.querySelector<HTMLElement>('.brand-guide');
  if (!nav || !list || !content) return;

  const headings = [...content.querySelectorAll<HTMLElement>('h2, h3')]
    .filter((heading) => !heading.closest('.showcase-demo, details'));
  let parent: HTMLLIElement | undefined;
  const links = headings.map((heading) => {
    if (!heading.id) {
      const base = (heading.textContent ?? '').trim().toLowerCase().normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
      let id = base;
      let suffix = 2;
      while (document.getElementById(id)) id = `${base}-${suffix++}`;
      heading.id = id;
    }
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent?.trim() ?? '';
    item.append(link);
    if (heading.tagName === 'H3' && parent) {
      let nested = parent.querySelector<HTMLUListElement>(':scope > ul');
      if (!nested) {
        nested = document.createElement('ul');
        nested.className = 'nav-list nav-list--nested';
        parent.append(nested);
      }
      nested.append(item);
    } else {
      list.append(item);
      parent = item;
    }
    return { heading, link };
  });

  let active: HTMLAnchorElement | undefined;
  function update() {
    // Use positions rather than only intersection entries: large sections,
    // fast scrolling and anchor jumps must all keep the right section active.
    const offset = Math.max(80, window.innerHeight * .15);
    let current: (typeof links)[number] | undefined = links[0];
    for (const entry of links) {
      if (entry.heading.getBoundingClientRect().top <= offset) current = entry;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      current = links.at(-1);
    }
    if (!current || active === current.link) return;
    active = current.link;
    links.forEach(({ link }) => {
      link.removeAttribute('aria-current');
      link.classList.remove('is-active-parent');
    });
    active.setAttribute('aria-current', 'location');
    const parentLink = active.closest('.nav-list--nested')?.parentElement?.querySelector(':scope > a');
    parentLink?.classList.add('is-active-parent');
    // Keep the selected entry visible within the sticky sidebar without
    // moving the page or stealing keyboard focus.
    const rect = active.getBoundingClientRect();
    const bounds = nav!.getBoundingClientRect();
    if (rect.top < bounds.top) nav!.scrollTop -= bounds.top - rect.top;
    else if (rect.bottom > bounds.bottom) nav!.scrollTop += rect.bottom - bounds.bottom;
  }
  let scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; update(); });
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate, { once: true });
  if ('ResizeObserver' in window) new ResizeObserver(scheduleUpdate).observe(content);
  update();
}
