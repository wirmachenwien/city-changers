import { Interactive } from "remotion";
import { z } from "zod";
import { commonSchema, studioSchema } from "./controls";
import { MascotCanvas } from "./MascotCanvas";
import { ThinkRig } from "./ThinkRig";

export const thinkSchema = commonSchema.extend({
  bodySway: z
    .number()
    .min(0)
    .max(10)
    .default(2)
    .describe("Body sway (degrees)"),
  gestureStart: z
    .number()
    .min(0)
    .max(0.97)
    .default(0.24)
    .describe("Idea starts (fraction of loop)"),
  gestureRaised: z
    .number()
    .min(0.01)
    .max(0.98)
    .default(0.46)
    .describe("Idea fully formed (fraction of loop)"),
  gestureHold: z
    .number()
    .min(0.01)
    .max(0.99)
    .default(0.72)
    .describe("Start returning to thinking (fraction of loop)"),
  gestureEnd: z
    .number()
    .min(0.02)
    .max(1)
    .default(0.98)
    .describe("Back at rest (fraction of loop)"),
  ideaTilt: z
    .number()
    .min(-5)
    .max(15)
    .default(9)
    .describe("Idea head lift / tilt (degrees)"),
  armX: z
    .number()
    .min(180)
    .max(240)
    .default(224)
    .describe("Raised hand horizontal position"),
  armY: z
    .number()
    .min(80)
    .max(155)
    .default(112)
    .describe("Raised hand height (lower = higher)"),
  smile: z.number().min(0).max(1).default(1).describe("Idea smile strength"),
  eyeOpen: z.number().min(0).max(5).default(3).describe("Idea eye opening"),
  ideaFaceColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#fff0a8")
    .describe("Illuminated face color")
    .meta({ studioType: "color" }),
  showIdeaRays: z.boolean().default(true).describe("Show yellow idea rays"),
});
export type ThinkProps = z.input<typeof thinkSchema>;
const ThinkInner = (props: ThinkProps) => (
  <MascotCanvas action="think" controls={thinkSchema.parse(props)}>
    <ThinkRig />
  </MascotCanvas>
);
export const Think = Interactive.create({
  Component: ThinkInner,
  layout: "absolute-fill",
  schema: studioSchema(thinkSchema),
});
