export type MotionName =
  | "idle"
  | "wave"
  | "point"
  | "celebrate"
  | "think"
  | "step";

export const MOTION_SPEED = 4;
export const LOOP_SECONDS = 4 / MOTION_SPEED;

export type MotionSettings = {
  loopSeconds?: number;
  bodyBob?: number;
  bodySway?: number;
  leafSway?: number;
  armSwing?: number;
  wristSwing?: number;
  waves?: number;
  wristPhase?: number;
  gestureStart?: number;
  gestureRaised?: number;
  gestureHold?: number;
  gestureEnd?: number;
  jumpHeight?: number;
  jumps?: number;
  ideaTilt?: number;
  armX?: number;
  armY?: number;
  smile?: number;
  eyeOpen?: number;
  steps?: number;
  bootSwing?: number;
  stepBob?: number;
};

const ease = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

/** A soft attack, readable hold and soft return, with matching loop boundaries. */
const gesture = (
  cycle: number,
  start: number,
  raised: number,
  hold: number,
  end: number,
) => {
  // Inspector fields are edited independently. Keep intermediate edits safe,
  // even while a user is moving one timing marker past another.
  const s = Math.max(0, Math.min(0.97, start));
  const r = Math.max(s + 0.01, Math.min(0.98, raised));
  const h = Math.max(r, Math.min(0.99, hold));
  const e = Math.max(h + 0.01, Math.min(1, end));
  return ease((cycle - s) / (r - s)) * (1 - ease((cycle - h) / (e - h)));
};

/** Four times the original tempo; four one-second loops per default clip. */
export const motionAt = (
  action: MotionName,
  seconds: number,
  settings: MotionSettings = {},
) => {
  const loopSeconds = Math.max(0.1, settings.loopSeconds ?? LOOP_SECONDS);
  const cycle = (((seconds / loopSeconds) % 1) + 1) % 1;
  const phase = cycle * Math.PI * 2;
  const breath = 1 - Math.cos(phase);
  const blink = Math.max(0, 1 - Math.abs(cycle - 0.7) / 0.03);
  const idea =
    action === "think"
      ? gesture(
          cycle,
          settings.gestureStart ?? 0.24,
          settings.gestureRaised ?? 0.46,
          settings.gestureHold ?? 0.72,
          settings.gestureEnd ?? 0.98,
        )
      : 0;
  const cycles =
    action === "step" ? (settings.steps ?? 2) : (settings.jumps ?? 2);
  return {
    lift:
      action === "celebrate"
        ? -(settings.jumpHeight ?? 7) *
          (1 - Math.cos(phase * cycles)) *
          (settings.bodyBob ?? 1)
        : action === "step"
          ? -(settings.stepBob ?? 3) *
            (1 - Math.cos(phase * cycles * 2)) *
            (settings.bodyBob ?? 1)
          : -breath * (settings.bodyBob ?? 1),
    tilt:
      action === "think"
        ? (settings.bodySway ?? 2) * Math.sin(phase) +
          (settings.ideaTilt ?? 9) * idea
        : action === "step"
          ? (settings.bodySway ?? 2) * Math.sin(phase * cycles)
          : (settings.bodySway ?? 0.6) * Math.sin(phase),
    leftArm:
      action === "celebrate"
        ? -(settings.armSwing ?? 7) * Math.sin(phase * cycles)
        : action === "step"
          ? (settings.armSwing ?? 10) * Math.sin(phase * cycles)
          : 0,
    rightArm:
      action === "wave"
        ? (settings.armSwing ?? 3) * Math.sin(phase * (settings.waves ?? 3))
        : action === "point"
          ? 0
          : action === "celebrate"
            ? (settings.armSwing ?? 7) * Math.sin(phase * cycles)
            : action === "step"
              ? -(settings.armSwing ?? 10) * Math.sin(phase * cycles)
              : 0,
    leftBoot:
      action === "step"
        ? (settings.bootSwing ?? 14) * (1 - Math.cos(phase * cycles))
        : 0,
    rightBoot:
      action === "step"
        ? -(settings.bootSwing ?? 14) * (1 - Math.cos(phase * cycles))
        : 0,
    plant: (settings.leafSway ?? 1.8) * Math.sin(phase),
    blink: 1 - blink * 0.92,
    wrist:
      action === "wave"
        ? (settings.wristSwing ?? 28) *
          Math.sin(
            phase * (settings.waves ?? 3) +
              ((settings.wristPhase ?? 60) * Math.PI) / 180,
          )
        : 0,
    reach:
      action === "point"
        ? gesture(
            cycle,
            settings.gestureStart ?? 0.08,
            settings.gestureRaised ?? 0.4,
            settings.gestureHold ?? 0.68,
            settings.gestureEnd ?? 0.96,
          )
        : 0,
    idea,
  };
};

const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

/** Shoulder stays fixed while the elbow and fingertip reach outwards. */
export const pointingArm = (reach: number) =>
  `M152,160C${mix(173.333, 177, reach)},${mix(164, 166, reach)} ${mix(184, 199, reach)},${mix(157.667, 150, reach)} ${mix(184, 226, reach)},${mix(141, 150, reach)}`;

/** The hand leaves the chin and lifts outside the silhouette: "I've got it!" */
export const ideaArm = (idea: number, x = 224, y = 112) =>
  `M152,163C${mix(178, 188, idea)},${mix(167, 178, idea)} ${mix(174, x + 2, idea)},${mix(193, y + 38, idea)} ${mix(143, x, idea)},${mix(184, y, idea)}`;

/** Quadratic thoughtful mouth converted to cubic, then opened into a smile. */
export const ideaMouth = (idea: number) =>
  `M${mix(118, 115, idea)},${mix(183, 178, idea)}C${mix(123.333333, 124, idea)},${mix(180.333333, 191, idea)} ${mix(128.333333, 134, idea)},${mix(179.666667, 191, idea)} ${mix(133, 143, idea)},${mix(181, 176, idea)}`;
