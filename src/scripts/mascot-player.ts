import type { AnimationItem } from 'lottie-web';
import { mascotViewBox } from '../lib/mascot-viewbox.mjs';

/** One pass per viewport visit, plus replay on hover or native button activation. */
class MascotPlayer extends HTMLElement {
  private animation?: AnimationItem;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private button: HTMLButtonElement | null = null;
  private loading = false;
  private entered = false;
  private layoutObserver?: ResizeObserver;
  private observing = false;
  private viewportFrame?: number;
  private generation = 0;

  connectedCallback() {
    this.button = this.querySelector('button');
    if (!this.button || !this.dataset.animation) return;
    this.button.addEventListener('click', this.replay);
    this.button.addEventListener('pointerenter', this.hover);
    this.reduced.addEventListener('change', this.motionPreference);
    this.motionPreference();
  }

  disconnectedCallback() {
    this.generation++;
    this.stopObserving();
    this.entered = false;
    this.button?.removeEventListener('click', this.replay);
    this.button?.removeEventListener('pointerenter', this.hover);
    this.reduced.removeEventListener('change', this.motionPreference);
    this.animation?.destroy();
    this.animation = undefined;
    this.loading = false;
    this.stop();
  }

  private stop = () => {
    this.animation?.pause();
    this.removeAttribute('data-playing');
    this.removeAttribute('data-rendered');
  };

  private complete = () => {
    // Lottie holds the final frame of the selected segment when loop is false.
    this.removeAttribute('data-playing');
  };

  private hover = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') void this.replay();
  };

  private motionPreference = () => {
    if (!this.button) return;
    this.button.hidden = this.reduced.matches;
    if (this.reduced.matches) {
      this.stop();
      this.stopObserving();
      this.entered = false;
    } else if (!this.observing) {
      this.observing = true;
      const header = document.querySelector('.site-head');
      if (typeof ResizeObserver !== 'undefined') {
        this.layoutObserver = new ResizeObserver(this.scheduleViewport);
        if (header) this.layoutObserver.observe(header);
        const artwork = this.querySelector('.mascot-box__artwork');
        if (artwork) this.layoutObserver.observe(artwork);
      }
      window.addEventListener('scroll', this.scheduleViewport, { passive: true });
      window.addEventListener('resize', this.scheduleViewport);
      window.addEventListener('load', this.scheduleViewport, true);
      this.scheduleViewport();
    }
  };

  private stopObserving = () => {
    this.observing = false;
    this.layoutObserver?.disconnect();
    this.layoutObserver = undefined;
    window.removeEventListener('scroll', this.scheduleViewport);
    window.removeEventListener('resize', this.scheduleViewport);
    window.removeEventListener('load', this.scheduleViewport, true);
    if (this.viewportFrame !== undefined) cancelAnimationFrame(this.viewportFrame);
    this.viewportFrame = undefined;
  };

  private scheduleViewport = () => {
    if (!this.observing || this.viewportFrame !== undefined) return;
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = undefined;
      this.checkViewport();
    });
  };

  private checkViewport = () => {
    if (!this.isConnected || this.reduced.matches) return;
    const artwork = this.querySelector('.mascot-box__artwork');
    if (!artwork) return;
    const rect = artwork.getBoundingClientRect();
    const navbarBottom = Math.max(0, document.querySelector('.site-head')?.getBoundingClientRect().bottom ?? 0);
    const viewport = document.documentElement;
    // IntersectionObserver rounds rootMargin to whole pixels. Keep fractional
    // CSS pixels here, and measure the artwork rather than its outer wrapper.
    const width = Math.max(0, Math.min(rect.right, viewport.clientWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, viewport.clientHeight) - Math.max(rect.top, navbarBottom));
    const visibleArea = width * height;
    if (visibleArea === 0) {
      this.entered = false;
    } else if (visibleArea >= rect.width * rect.height * .25 && !this.entered) {
      this.entered = true;
      void this.replay();
    }
  };

  private replay = async () => {
    if (this.loading || this.reduced.matches || !this.button) return;
    const generation = this.generation;
    this.loading = true;
    try {
      if (!this.animation) {
        const [lottie, response] = await Promise.all([
          import('lottie-web/build/player/lottie_light'),
          fetch(this.dataset.animation!),
        ]);
        if (!response.ok) throw new Error('Mascot animation could not be loaded');
        const animationData = await response.json();
        if (!this.isConnected || this.reduced.matches || generation !== this.generation) return;
        const container = this.querySelector<HTMLElement>('.mascot-box__animation')!;
        this.animation = lottie.default.loadAnimation({
          container, renderer: 'svg', loop: false, autoplay: false, animationData,
          rendererSettings: { progressiveLoad: false, viewBoxSize: mascotViewBox(animationData) },
        });
        this.animation.addEventListener('complete', this.complete);
        // Only swap out the usable still when the SVG is ready.
        await new Promise<void>((resolve, reject) => {
          this.animation!.addEventListener('DOMLoaded', () => resolve());
          this.animation!.addEventListener('data_failed', () => reject(new Error('Invalid animation')));
        });
      }
      if (!this.isConnected || this.reduced.matches || generation !== this.generation) return;
      const holdFrame = Number(this.dataset.holdFrame);
      if (Number.isInteger(holdFrame) && holdFrame > 0 && holdFrame < this.animation.totalFrames) {
        // Segment ends are exclusive. Think stops with the hand up and rays lit,
        // rather than playing the loop's return to its questioning expression.
        this.animation.playSegments([0, holdFrame + 1], true);
      } else {
        this.animation.goToAndPlay(0, true);
      }
      this.setAttribute('data-rendered', '');
      this.setAttribute('data-playing', '');
    } catch {
      // Keep the complete text and still usable on network/renderer failure.
      this.stop();
      this.animation?.destroy();
      this.animation = undefined;
      this.button.hidden = true;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  };
}

if (!customElements.get('mascot-player')) customElements.define('mascot-player', MascotPlayer);
