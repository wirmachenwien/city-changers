import { Interactive } from "remotion";
import { z } from "zod";
import { commonSchema, studioSchema } from "./controls";
import { MascotCanvas } from "./MascotCanvas";
import { PointRig } from "./PointRig";

export const pointSchema = commonSchema.extend({
  gestureStart: z
    .number()
    .min(0)
    .max(0.97)
    .default(0.08)
    .describe("Start extending (fraction of loop)"),
  gestureRaised: z
    .number()
    .min(0.01)
    .max(0.98)
    .default(0.4)
    .describe("Fully extended (fraction of loop)"),
  gestureHold: z
    .number()
    .min(0.01)
    .max(0.99)
    .default(0.68)
    .describe("Start retracting (fraction of loop)"),
  gestureEnd: z
    .number()
    .min(0.02)
    .max(1)
    .default(0.96)
    .describe("Back at rest (fraction of loop)"),
});
export type PointProps = z.input<typeof pointSchema>;
const PointInner = (props: PointProps) => (
  <MascotCanvas action="point" controls={pointSchema.parse(props)}>
    <PointRig />
  </MascotCanvas>
);
export const Point = Interactive.create({
  Component: PointInner,
  layout: "absolute-fill",
  schema: studioSchema(pointSchema),
});
