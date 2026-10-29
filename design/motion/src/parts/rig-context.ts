import { createContext, useContext } from "react";
import type poses from "../../../assets/mascot/source/poses.json";
import type { motionAt, MotionSettings } from "../motion";

type RigState = {
  animate: boolean;
  dark: boolean;
  pose: (typeof poses)[keyof typeof poses];
  motion: ReturnType<typeof motionAt>;
  settings: MotionSettings;
  ideaFaceColor: string;
  showIdeaRays: boolean;
};
export const RigContext = createContext<RigState | null>(null);
export const useRig = () => {
  const context = useContext(RigContext);
  if (!context)
    throw new Error("Editable mascot parts must be inside MascotArtwork");
  return context;
};
