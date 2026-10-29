import { Interactive } from "remotion";
import { z } from "zod";
import { commonSchema, studioSchema } from "./controls";
import { MascotCanvas } from "./MascotCanvas";
import { IdleRig } from "./IdleRig";

export const idleSchema = commonSchema;
export type IdleProps = z.input<typeof idleSchema>;
const IdleInner = (props: IdleProps) => (
  <MascotCanvas action="idle" controls={idleSchema.parse(props)}>
    <IdleRig />
  </MascotCanvas>
);
export const Idle = Interactive.create({
  Component: IdleInner,
  layout: "absolute-fill",
  schema: studioSchema(idleSchema),
});
