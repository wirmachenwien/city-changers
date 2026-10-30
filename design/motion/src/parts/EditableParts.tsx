import type { CSSProperties, ReactNode } from "react";
import { interpolatePaths } from "@remotion/paths";
import { Interactive, interpolateColors } from "remotion";
import { useRig } from "./rig-context";

const presetField = {
  type: "boolean",
  default: true,
  description: "Use preset motion (off = your keyframes only)",
  keyframable: false,
} as const;
const color = (defaultValue: string | undefined, description: string) =>
  ({ type: "color", default: defaultValue, description }) as const;
const path = (description: string) =>
  ({ type: "svg-path", default: undefined, description }) as const;
const number = (defaultValue: number, description: string) =>
  ({
    type: "number",
    default: defaultValue,
    description,
    hiddenFromList: false,
    step: 0.01,
  }) as const;
const palette = (value: string | undefined, dark: boolean) =>
  dark && value === "#20221c" ? "#cbbf9f" : value;

type GroupProps = {
  children?: ReactNode;
  style?: CSSProperties;
  usePresetMotion?: boolean;
  presetTransform?: string;
  baseTransform?: string;
  presetOpacity?: number;
};
const GroupInner = ({
  children,
  style,
  usePresetMotion = true,
  presetTransform,
  baseTransform,
  presetOpacity = 1,
}: GroupProps) => (
  <g style={style}>
    <g
      transform={usePresetMotion ? presetTransform : baseTransform}
      opacity={usePresetMotion ? presetOpacity : 1}
    >
      {children}
    </g>
  </g>
);
export const MotionPart = Interactive.create({
  Component: GroupInner,
  componentName: "MotionPart",
  layout: "none",
  schema: {
    usePresetMotion: presetField,
  },
});

type PathProps = {
  d: string;
  targetD?: string;
  stillD?: string;
  fill?: string;
  targetFill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt";
  strokeLinejoin?: "round" | "miter";
  style?: CSSProperties;
  usePresetMotion?: boolean;
  progress?: number;
  presetProgress?: number;
  presetTransform?: string;
  baseTransform?: string;
  presetOpacity?: number;
  presetTargetFill?: string;
  faceDetail?: boolean;
  presetTargetD?: string;
  defaultTargetD?: string;
};
const PathInner = ({
  d,
  targetD,
  stillD,
  fill = "none",
  targetFill,
  stroke = "none",
  strokeWidth = 0,
  strokeLinecap = "round",
  strokeLinejoin = "round",
  style,
  usePresetMotion = true,
  progress = 0,
  presetProgress = 0,
  presetTransform,
  baseTransform,
  presetOpacity = 1,
  presetTargetFill,
  faceDetail = false,
  presetTargetD,
  defaultTargetD,
}: PathProps) => {
  const { dark, animate } = useRig();
  const amount = Math.max(
    0,
    Math.min(1, usePresetMotion ? presetProgress : progress),
  );
  const endFill = targetFill ?? presetTargetFill;
  const endD =
    usePresetMotion && targetD === defaultTargetD && presetTargetD
      ? presetTargetD
      : targetD;
  const geometry =
    !animate && stillD
      ? stillD
      : !endD || amount === 0
        ? d
        : amount === 1
          ? endD
          : interpolatePaths(amount, [0, 1], [d, endD]);
  return (
    <g style={style}>
      <path
        d={geometry}
        transform={usePresetMotion ? presetTransform : baseTransform}
        opacity={usePresetMotion ? presetOpacity : 1}
        fill={
          endFill && fill !== "none"
            ? interpolateColors(
                amount,
                [0, 1],
                [palette(fill, dark)!, palette(endFill, dark)!],
              )
            : palette(fill, dark)
        }
        stroke={palette(stroke, dark && !faceDetail)}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
      />
    </g>
  );
};
export const PathPart = Interactive.create({
  Component: PathInner,
  componentName: "PathPart",
  layout: "none",
  schema: {
    usePresetMotion: presetField,
    d: path("Rest / start shape"),
    targetD: path("Target shape (optional)"),
    progress: {
      ...number(0, "Custom morph: 0 = start, 1 = target (preset off)"),
      min: 0,
      max: 1,
    },
    fill: color("none", "Fill"),
    targetFill: color(undefined, "Target fill (optional)"),
    stroke: color("none", "Outline"),
    strokeWidth: { ...number(0, "Outline width"), min: 0, max: 30 },
  },
});

type EyeProps = {
  cx: number;
  cy: number;
  rx?: number;
  ry?: number;
  fill?: string;
  openness?: number;
  style?: CSSProperties;
  usePresetMotion?: boolean;
};
const EyeInner = ({
  cx,
  cy,
  rx = 4,
  ry = 7,
  fill = "#20221c",
  openness = 1,
  style,
  usePresetMotion = true,
}: EyeProps) => {
  const { motion, settings } = useRig();
  return (
    <g style={style}>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={Math.max(
          0,
          (ry + (usePresetMotion ? motion.idea * (settings.eyeOpen ?? 3) : 0)) *
            openness *
            (usePresetMotion ? motion.blink : 1),
        )}
        fill={fill}
      />
    </g>
  );
};
export const EyePart = Interactive.create({
  Component: EyeInner,
  componentName: "EyePart",
  layout: "none",
  schema: {
    usePresetMotion: presetField,
    cx: number(115, "Eye X"),
    cy: number(162, "Eye Y"),
    rx: { ...number(4, "Eye width / radius"), min: 0.1, max: 20 },
    ry: { ...number(7, "Eye height / radius"), min: 0.1, max: 20 },
    openness: { ...number(1, "Eye opening / blink"), min: 0, max: 2 },
    fill: color("#20221c", "Eye color"),
  },
});
