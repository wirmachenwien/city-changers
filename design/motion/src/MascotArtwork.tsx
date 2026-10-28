import type { CSSProperties, ReactNode } from "react";
import { Freeze, useCurrentFrame, useVideoConfig } from "remotion";
import poses from "../../assets/mascot/source/poses.json";
import { motionAt, type MotionName, type MotionSettings } from "./motion";
import { RigContext } from "./parts/rig-context";

export type PoseName = keyof typeof poses;
export type Treatment = "ink" | "linen";
export type ArtworkProps = {
  children: ReactNode;
  action?: MotionName;
  treatment?: Treatment;
  size?: number;
  animate?: boolean;
  style?: CSSProperties;
  settings?: MotionSettings;
  ideaFaceColor?: string;
  showIdeaRays?: boolean;
};

/** Shared clock/palette only. Each mascot authors its own editable part instances. */
export const MascotArtwork = ({
  children,
  action = "idle",
  treatment = "ink",
  size = 800,
  animate = true,
  style,
  settings = {},
  ideaFaceColor = "#fff0a8",
  showIdeaRays = true,
}: ArtworkProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pose = poses[action === "idle" ? "neutral" : action];
  const motion = motionAt(action, animate ? frame / fps : 0, settings);
  return (
    <Freeze frame={0} active={!animate}>
      <RigContext.Provider
        value={{
          pose,
          motion,
          settings,
          dark: treatment === "linen",
          animate,
          ideaFaceColor,
          showIdeaRays,
        }}
      >
        <svg
          viewBox="-16 -16 288 288"
          width={size}
          height={size}
          fillRule="evenodd"
          clipRule="evenodd"
          strokeLinecap="round"
          role="img"
          aria-label={`The Green Fix — ${pose.label}`}
          style={{ display: "block", ...style }}
        >
          {children}
        </svg>
      </RigContext.Provider>
    </Freeze>
  );
};
