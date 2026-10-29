import type { CSSProperties } from "react";
import type { MotionName } from "./motion";
import type { Treatment } from "./MascotArtwork";
import { Idle } from "./mascots/Idle";
import { Wave } from "./mascots/Wave";
import { Point } from "./mascots/Point";
import { Celebrate } from "./mascots/Celebrate";
import { Think } from "./mascots/Think";
import { Step } from "./mascots/Step";

export type MascotProps = {
  action?: MotionName;
  treatment?: Treatment;
  size?: number;
  animate?: boolean;
  style?: CSSProperties;
};
/** Compatibility helper for social layouts. For Studio editing, use a named mascot directly. */
export const Mascot = ({
  action = "idle",
  treatment = "ink",
  size = 800,
  animate = true,
  style,
}: MascotProps) => {
  const Character = {
    idle: Idle,
    wave: Wave,
    point: Point,
    celebrate: Celebrate,
    think: Think,
    step: Step,
  }[action];
  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <Character size={size} treatment={treatment} animate={animate} />
    </div>
  );
};
