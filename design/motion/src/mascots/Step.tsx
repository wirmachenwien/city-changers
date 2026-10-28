import { Interactive } from "remotion";
import { z } from "zod";
import { commonSchema, studioSchema } from "./controls";
import { MascotCanvas } from "./MascotCanvas";
import { StepRig } from "./StepRig";

export const stepSchema = commonSchema.extend({
  bodySway: z
    .number()
    .min(0)
    .max(10)
    .default(2)
    .describe("Body sway (degrees)"),
  steps: z.number().int().min(1).max(4).default(2).describe("Steps per loop"),
  bootSwing: z
    .number()
    .min(0)
    .max(25)
    .default(14)
    .describe("Boot swing (degrees)"),
  armSwing: z
    .number()
    .min(0)
    .max(25)
    .default(10)
    .describe("Arm swing (degrees)"),
  stepBob: z.number().min(0).max(8).default(3).describe("Step bounce"),
});
export type StepProps = z.input<typeof stepSchema>;
const StepInner = (props: StepProps) => (
  <MascotCanvas action="step" controls={stepSchema.parse(props)}>
    <StepRig />
  </MascotCanvas>
);
export const Step = Interactive.create({
  Component: StepInner,
  layout: "absolute-fill",
  schema: studioSchema(stepSchema),
});
