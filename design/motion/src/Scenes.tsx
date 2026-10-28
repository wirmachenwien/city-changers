import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ReactNode } from "react";
import { z } from "zod";
import { Mascot } from "./Mascot";
import { Idle } from "./mascots/Idle";
import { Wave } from "./mascots/Wave";
import { Point } from "./mascots/Point";
import { Celebrate } from "./mascots/Celebrate";
import { Think } from "./mascots/Think";
import { Step } from "./mascots/Step";

export const Showcase = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#fdfcf9",
      padding: 64,
      fontFamily: "Arial, sans-serif",
      color: "#20221c",
    }}
  >
    <div style={{ fontSize: 22, letterSpacing: 3, color: "#176b43" }}>
      THE GREEN FIX / MOTION LIBRARY
    </div>
    <div style={{ fontSize: 64, marginTop: 16 }}>
      A little character. A lot of possibility.
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 22,
        flex: 1,
        marginTop: 32,
      }}
    >
      <Tile label="01 / READY TO HELP">
        <Idle name="01 — Ready to help" size={295} />
      </Tile>
      <Tile label="02 / HELLO, NEIGHBOUR">
        <Wave name="02 — Wave" size={295} />
      </Tile>
      <Tile label="03 / LOOK OVER HERE">
        <Point name="03 — Point" size={295} />
      </Tile>
      <Tile label="04 / WE DID IT!" dark>
        <Celebrate name="04 — Celebrate" size={295} treatment="linen" />
      </Tile>
      <Tile label="05 / WHAT IF…? AHA!" dark>
        <Think name="05 — Think and idea" size={295} treatment="linen" />
      </Tile>
      <Tile label="06 / LET’S GET MOVING" dark>
        <Step name="06 — Step" size={295} treatment="linen" />
      </Tile>
    </div>
  </AbsoluteFill>
);

const Tile = ({
  children,
  label,
  dark = false,
}: {
  children: ReactNode;
  label: string;
  dark?: boolean;
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: dark ? "#161511" : "#efeee5",
      color: dark ? "#f2ede3" : "#20221c",
      borderRadius: 24,
    }}
  >
    <div style={{ position: "relative", width: 295, height: 295 }}>
      {children}
    </div>
    <div style={{ fontSize: 20, letterSpacing: 1, paddingBottom: 18 }}>
      {label}
    </div>
  </div>
);

export const socialSchema = z.object({
  headline: z.string(),
  caption: z.string(),
  action: z.enum(["idle", "wave", "point", "celebrate", "think", "step"]),
  dark: z.boolean(),
});
export type SocialProps = z.infer<typeof socialSchema>;

/** Optional captioned layout, separate from the clean transparent overlays. */
export const Social = ({ headline, caption, action, dark }: SocialProps) => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: dark ? "#161511" : "#fdfcf9",
        color: dark ? "#f2ede3" : "#20221c",
        padding: portrait ? "180px 90px 240px" : "82px 90px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 27,
          letterSpacing: 3,
          color: dark ? "#cbbf9f" : "#176b43",
        }}
      >
        TOOLBOX FOR CITY CHANGERS
      </div>
      <div
        style={{
          fontSize: portrait ? 100 : 88,
          fontWeight: 700,
          lineHeight: 1.04,
          marginTop: 50,
          whiteSpace: "pre-line",
          maxHeight: portrait ? 440 : 280,
          overflow: "hidden",
          overflowWrap: "anywhere",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 44,
          lineHeight: 1.3,
          marginTop: 28,
          maxHeight: 150,
          overflow: "hidden",
          overflowWrap: "anywhere",
        }}
      >
        {caption}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        <Mascot
          action={action}
          treatment={dark ? "linen" : "ink"}
          size={portrait ? 850 : 480}
        />
      </div>
    </AbsoluteFill>
  );
};
