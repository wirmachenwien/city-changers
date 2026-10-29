import { MotionPart, PathPart, EyePart } from "../parts/EditableParts";
import { useRig } from "../parts/rig-context";
import { ideaArm } from "../motion";

export const ThinkRig = () => {
  const { motion, pose, settings, animate, ideaFaceColor, showIdeaRays } =
    useRig();
  return (
    <MotionPart
      name="Body motion — thinking to idea"
      usePresetMotion={true}
      presetTransform={`translate(0 ${pose.lift + motion.lift}) rotate(${pose.tilt + motion.tilt} 128 220)`}
      baseTransform={`translate(0 ${pose.lift}) rotate(${pose.tilt} 128 220)`}
      style={{
        translate: "0px 0px",
        rotate: "0deg",
        transformOrigin: "50% 81.944444%",
      }}
    >
      <PathPart
        name="Left boot"
        d="M104,196L128,196L128,220C128,228 125.333,232 120,232L76,232C76,221.333 81.333,216 92,216L104,216L104,196Z"
        fill="#20221c"
        usePresetMotion={true}
        style={{ rotate: "0deg", transformOrigin: "45.833333% 75.694444%" }}
      />
      <PathPart
        name="Right boot"
        d="M152,196L128,196L128,220C128,228 130.667,232 136,232L180,232C180,221.333 174.667,216 164,216L152,216L152,196Z"
        fill="#20221c"
        usePresetMotion={true}
        style={{ rotate: "0deg", transformOrigin: "54.166667% 75.694444%" }}
      />
      <PathPart
        name="Left arm"
        d="M104,160C82,162 76,176 82,183"
        stroke="#20221c"
        strokeWidth={9}
        usePresetMotion={true}
        style={{ rotate: "0deg", transformOrigin: "41.666667% 61.111111%" }}
      />
      <PathPart
        name="Face — light up"
        d="M88,24L92,60L128,84L164,60L168,24C198,30 218,66 204,100C196,124 176,138 154,144L154,198C154,212.667 145.333,220 128,220C110.667,220 102,212.667 102,198L102,144C80,138 60,124 52,100C38,66 58,30 88,24Z"
        fill="#ffd84f"
        presetTargetFill={ideaFaceColor}
        presetProgress={motion.idea}
        progress={0}
        stroke="#20221c"
        strokeWidth={8}
        strokeLinecap="butt"
        usePresetMotion={true}
        style={{ translate: "0px 0px" }}
      />
      <PathPart
        name="Green head"
        d="M88,24L92,60L128,84L164,60L168,24C198,30 218,66 204,100C196,124 176,138 154,144L102,144C80,138 60,124 52,100C38,66 58,30 88,24Z"
        fill="#176b43"
        stroke="#20221c"
        strokeWidth={8}
        strokeLinecap="butt"
        usePresetMotion={true}
        style={{ rotate: "0deg", transformOrigin: "50% 55.555556%" }}
      />
      <EyePart
        name="Left eye — blink and brighten"
        cx={115}
        cy={162}
        rx={4}
        ry={5}
        openness={1}
        fill="#20221c"
        usePresetMotion={true}
        style={{ scale: 1, transformOrigin: "45.486111% 61.805556%" }}
      />
      <EyePart
        name="Right eye — blink and brighten"
        cx={141}
        cy={160}
        rx={4}
        ry={5}
        openness={1}
        fill="#20221c"
        usePresetMotion={true}
        style={{ scale: 1, transformOrigin: "54.513889% 61.111111%" }}
      />
      <PathPart
        name="Mouth — hmm to smile"
        d="M118,183Q126,179 133,181"
        targetD="M115,178C124,191 134,191 143,176"
        presetProgress={motion.idea * (settings.smile ?? 1)}
        progress={0}
        stroke="#20221c"
        strokeWidth={6}
        faceDetail={true}
        usePresetMotion={true}
        style={{ translate: "0px 0px" }}
      />
      <PathPart
        name="Idea rays"
        d="M237,112L246,108M238,124L250,124M234,136L244,142"
        stroke="#ffd84f"
        strokeWidth={4}
        presetOpacity={animate && showIdeaRays ? motion.idea : 0}
        usePresetMotion={true}
        style={{
          opacity: 1,
          rotate: "0deg",
          transformOrigin: "83.333333% 48.611111%",
        }}
      />
      <MotionPart
        name="Sprout sway"
        usePresetMotion={true}
        presetTransform={`rotate(${motion.plant} 194 94)`}
        style={{ rotate: "0deg", transformOrigin: "72.916667% 38.194444%" }}
      >
        <PathPart
          name="Sprout stem"
          d="M194,94C204.667,82 211.333,67.667 214,51"
          stroke="#20221c"
          strokeWidth={7}
          usePresetMotion={true}
          style={{ translate: "0px 0px" }}
        />
        <PathPart
          name="Leaf"
          d="M212,54C206.667,36.667 214.667,24.667 236,18C241.333,38 233.333,50 212,54Z"
          fill="#176b43"
          stroke="#20221c"
          strokeWidth={6}
          strokeLinecap="butt"
          usePresetMotion={true}
          style={{ rotate: "0deg", transformOrigin: "79.166667% 24.305556%" }}
        />
      </MotionPart>
      <PathPart
        name="Right arm — chin to raised hand"
        d="M152,163C178,167 174,193 143,184"
        targetD="M152,163C188,178 226,150 224,112"
        defaultTargetD="M152,163C188,178 226,150 224,112"
        presetTargetD={ideaArm(1, settings.armX, settings.armY)}
        presetProgress={motion.idea}
        progress={0}
        stroke="#20221c"
        strokeWidth={9}
        usePresetMotion={true}
        style={{
          rotate: "0deg",
          transformOrigin: "58.333333% 62.152778%",
          translate: "3.2px 0px"
        }}
      />
    </MotionPart>
  );
};
