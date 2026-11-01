import type { AnimationItem } from 'lottie-web';
import { logoMascotViewBox } from '../lib/mascot-viewbox.mjs';

const initialized = new WeakSet<HTMLElement>();

/** Decorative motion only: the enclosing home link and static logo stay usable. */
export function initBrandMascot(): void {
  for (const logo of document.querySelectorAll<HTMLElement>('[data-brand-animation]')) {
    if (initialized.has(logo)) continue;
    initialized.add(logo);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations: AnimationItem[] = [];
    let loading = false;
    let failed = false;

    const replay = async () => {
      if (reduced.matches || loading || failed) return;
      loading = true;
      try {
        if (!animations.length) {
          const lottie = await import('lottie-web/build/player/lottie_light');
          if (reduced.matches || !logo.isConnected) return;
          const containers = [...logo.querySelectorAll<HTMLElement>('[data-brand-animation-src]')];
          const artwork = await Promise.all(containers.map(async container => {
            const response = await fetch(container.dataset.brandAnimationSrc!);
            if (!response.ok) throw new Error('Logo animation unavailable');
            return response.json();
          }));
          if (reduced.matches || !logo.isConnected) return;
          await Promise.all(containers.map(async (container, index) => {
            const animationData = artwork[index];
            const animation = lottie.default.loadAnimation({
              container, renderer: 'svg', loop: false, autoplay: false, animationData,
              rendererSettings: { progressiveLoad: false, viewBoxSize: logoMascotViewBox(animationData) },
            });
            animations.push(animation);
            // Resolve to the logo master's neutral pose rather than holding
            // the last fractional frame of the idle cycle.
            animation.addEventListener('complete', () => animation.goToAndStop(0, true));
            await new Promise<void>((resolve, reject) => {
              animation.addEventListener('DOMLoaded', () => resolve());
              animation.addEventListener('data_failed', () => reject(new Error('Invalid logo animation')));
            });
          }));
        }
        if (reduced.matches || !logo.isConnected || !animations.length) return;
        logo.setAttribute('data-brand-ready', '');
        for (const animation of animations) animation.goToAndPlay(0, true);
      } catch {
        failed = true;
        logo.removeAttribute('data-brand-ready');
        for (const animation of animations) animation.destroy();
        animations.length = 0;
      } finally {
        loading = false;
      }
    };

    logo.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') void replay();
    });
    logo.closest('a')?.addEventListener('focus', () => void replay());
    reduced.addEventListener('change', () => {
      if (reduced.matches) {
        logo.removeAttribute('data-brand-ready');
        for (const animation of animations) animation.pause();
      } else void replay();
    });
    void replay();
  }
}
