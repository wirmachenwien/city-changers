import { Interactive } from "remotion";
import { z } from "zod";
import { commonSchema, studioSchema } from "./controls";
import { MascotCanvas } from "./MascotCanvas";
import { WaveRig } from "./WaveRig";

export const waveSchema = commonSchema;
export type WaveProps = z.input<typeof waveSchema>;
const WaveInner = (props: WaveProps) => (
  <MascotCanvas action="wave" controls={waveSchema.parse(props)}>
    <WaveRig />
  </MascotCanvas>
);
export const Wave = Interactive.create({
  Component: WaveInner,
  layout: "absolute-fill",
  schema: studioSchema(waveSchema),
});
