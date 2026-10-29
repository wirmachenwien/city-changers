import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { ReactNode } from "react";
import { MascotArtwork } from "../MascotArtwork";
import type { MotionName, MotionSettings } from "../motion";
import type { commonSchema } from "./controls";

type Controls = z.output<typeof commonSchema> &
  MotionSettings & {
    ideaFaceColor?: string;
    showIdeaRays?: boolean;
  };

/** Shared artwork and framing only; each mascot owns its controls and defaults. */
export const MascotCanvas = ({
  action,
  controls,
  children,
}: {
  action: MotionName;
  controls: Controls;
  children: ReactNode;
}) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        controls.background === "paper"
          ? "#fdfcf9"
          : controls.background === "ink"
            ? "#161511"
            : "transparent",
    }}
  >
    <MascotArtwork
      action={action}
      treatment={controls.treatment}
      size={controls.size}
      animate={controls.animate}
      settings={controls}
      ideaFaceColor={controls.ideaFaceColor}
      showIdeaRays={controls.showIdeaRays}
    >
      {children}
    </MascotArtwork>
  </AbsoluteFill>
);
