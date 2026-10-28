import { Interactive } from "remotion";
import { z } from "zod";
import { commonSchema, studioSchema } from "./controls";
import { MascotCanvas } from "./MascotCanvas";
import { CelebrateRig } from "./CelebrateRig";

export const celebrateSchema = commonSchema.extend({
  jumpHeight: z.number().min(0).max(14).default(7).describe("Jump height"),
  jumps: z.number().int().min(1).max(4).default(2).describe("Jumps per loop"),
  armSwing: z
    .number()
    .min(0)
    .max(20)
    .default(7)
    .describe("Arm swing (degrees)"),
});
export type CelebrateProps = z.input<typeof celebrateSchema>;
const CelebrateInner = (props: CelebrateProps) => (
  <MascotCanvas action="celebrate" controls={celebrateSchema.parse(props)}>
    <CelebrateRig />
  </MascotCanvas>
);
export const Celebrate = Interactive.create({
  Component: CelebrateInner,
  layout: "absolute-fill",
  schema: studioSchema(celebrateSchema),
});
