// Generated markup is trusted build output of design/icons/drawn/*.svg.
// Both Astro components and client-side controls use this one icon family.
import icons from '../data/icons.generated.json' with { type: 'json' };

export type IconName = keyof typeof icons;

export function iconSvg(name: IconName): string {
  return icons[name];
}
