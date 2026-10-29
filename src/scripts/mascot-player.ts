import type { AnimationItem } from 'lottie-web';

/** One pass per viewport visit, plus replay on hover or native button activation. */
class MascotPlayer extends HTMLElement {
  private animation?: AnimationItem;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private button: HTMLButtonElement | null = null;
  private loading = false;
  private entered = false;
  private observer?: IntersectionObserver;
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
    this.observer?.disconnect();
    this.observer = undefined;
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
      this.observer?.disconnect();
      this.observer = undefined;
      this.entered = false;
    } else if (!this.observer) {
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            this.entered = false;
          } else if (entry.intersectionRatio >= .25 && !this.entered) {
            this.entered = true;
            void this.replay();
          }
        }
      }, { threshold: [0, .25] });
      this.observer.observe(this);
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
          rendererSettings: { progressiveLoad: false },
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
