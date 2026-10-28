import { Composition, Folder } from "remotion";
import { Showcase, Social, socialSchema } from "./Scenes";
import { overlayMetadata } from "./mascots/controls";
import { Idle, idleSchema } from "./mascots/Idle";
import { Wave, waveSchema } from "./mascots/Wave";
import { Point, pointSchema } from "./mascots/Point";
import { Celebrate, celebrateSchema } from "./mascots/Celebrate";
import { Think, thinkSchema } from "./mascots/Think";
import { Step, stepSchema } from "./mascots/Step";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Mascot-Library"
        component={Showcase}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={120}
      />
      <Folder name="Transparent-overlays">
        <Composition
          id="Mascot-Idle"
          component={Idle}
          schema={idleSchema}
          calculateMetadata={overlayMetadata}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={30}
          defaultProps={{
            treatment: "ink",
            size: 900,
            background: "transparent",
            animate: true,
            loopSeconds: 1,
            bodyBob: 1,
            bodySway: 0.6,
            leafSway: 1.8,
          }}
        />
        <Composition
          id="Mascot-Wave"
          component={Wave}
          schema={waveSchema}
          calculateMetadata={overlayMetadata}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={30}
          defaultProps={{
            treatment: "ink",
            size: 900,
            background: "transparent",
            animate: true,
            loopSeconds: 1,
            bodyBob: 1,
            bodySway: 0.6,
            leafSway: 1.8,
          }}
        />
        <Composition
          id="Mascot-Point"
          component={Point}
          schema={pointSchema}
          calculateMetadata={overlayMetadata}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={30}
          defaultProps={{
            treatment: "ink",
            size: 900,
            background: "transparent",
            animate: true,
            loopSeconds: 1,
            bodyBob: 1,
            bodySway: 0.6,
            leafSway: 1.8,
            gestureStart: 0.08,
            gestureRaised: 0.4,
            gestureHold: 0.68,
            gestureEnd: 0.96,
          }}
        />
        <Composition
          id="Mascot-Celebrate"
          component={Celebrate}
          schema={celebrateSchema}
          calculateMetadata={overlayMetadata}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={30}
          defaultProps={{
            treatment: "ink",
            size: 900,
            background: "transparent",
            animate: true,
            loopSeconds: 1,
            bodyBob: 1,
            bodySway: 0.6,
            leafSway: 1.8,
            jumpHeight: 7,
            jumps: 2,
            armSwing: 7,
          }}
        />
        <Composition
          id="Mascot-Think"
          component={Think}
          schema={thinkSchema}
          calculateMetadata={overlayMetadata}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={30}
          defaultProps={{
            treatment: "ink",
            size: 900,
            background: "transparent",
            animate: true,
            loopSeconds: 1,
            bodyBob: 1,
            bodySway: 2,
            leafSway: 1.8,
            gestureStart: 0.24,
            gestureRaised: 0.46,
            gestureHold: 0.72,
            gestureEnd: 0.98,
            ideaTilt: 9,
            armX: 224,
            armY: 112,
            smile: 1,
            eyeOpen: 3,
            ideaFaceColor: "#fff0a8",
            showIdeaRays: true,
          }}
        />
        <Composition
          id="Mascot-Step"
          component={Step}
          schema={stepSchema}
          calculateMetadata={overlayMetadata}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={30}
          defaultProps={{
            treatment: "ink",
            size: 900,
            background: "transparent",
            animate: true,
            loopSeconds: 1,
            bodyBob: 1,
            bodySway: 2,
            leafSway: 1.8,
            steps: 2,
            bootSwing: 14,
            armSwing: 10,
            stepBob: 3,
          }}
        />
      </Folder>
      <Folder name="Social-layouts">
        <Composition
          id="Social-Square"
          component={Social}
          schema={socialSchema}
          width={1080}
          height={1080}
          fps={30}
          durationInFrames={120}
          defaultProps={{
            headline: "Small steps.\nReal change.",
            caption: "Let’s make our streets better, together.",
            action: "wave",
            dark: false,
          }}
        />
        <Composition
          id="Social-Portrait"
          component={Social}
          schema={socialSchema}
          width={1080}
          height={1920}
          fps={30}
          durationInFrames={120}
          defaultProps={{
            headline: "Good ideas\nstart with us.",
            caption: "Your neighbourhood. Your next step.",
            action: "celebrate",
            dark: true,
          }}
        />
      </Folder>
    </>
  );
};
