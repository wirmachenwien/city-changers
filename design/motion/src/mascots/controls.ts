import type { InteractivitySchema } from "remotion";
import { z } from "zod";

/** One definition drives both the composition Props panel and timeline inspector. */
export const commonSchema = z.object({
  treatment: z
    .enum(["ink", "linen"])
    .default("ink")
    .describe("Outline color: Ink or Linen"),
  background: z
    .enum(["transparent", "paper", "ink"])
    .default("transparent")
    .describe("Preview / export background"),
  size: z
    .number()
    .min(80)
    .max(1000)
    .default(900)
    .describe("Mascot size (pixels)"),
  animate: z.boolean().default(true).describe("Animate mascot"),
  loopSeconds: z
    .number()
    .min(0.25)
    .max(8)
    .default(1)
    .describe("Seconds per loop (lower = faster)"),
  bodyBob: z
    .number()
    .min(0)
    .max(3)
    .default(1)
    .describe("Body bounce multiplier"),
  bodySway: z
    .number()
    .min(0)
    .max(10)
    .default(0.6)
    .describe("Body sway (degrees)"),
  leafSway: z
    .number()
    .min(0)
    .max(10)
    .default(1.8)
    .describe("Leaf sway (degrees)"),
});

type Field = {
  type?: string;
  default?: unknown;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  studioType?: "color" | "svg-path";
  step?: number;
};

export const studioSchema = (schema: z.ZodObject): InteractivitySchema => {
  const properties = z.toJSONSchema(schema).properties ?? {};
  return Object.fromEntries(
    Object.entries(properties).map(([key, raw]) => {
      const field = raw as Field;
      const label = {
        description: field.description ?? key,
        keyframable: false,
      };
      if (field.enum)
        return [
          key,
          {
            ...label,
            type: "enum",
            default: String(field.default),
            variants: Object.fromEntries(
              field.enum.map((value) => [value, {}]),
            ),
          },
        ];
      if (field.type === "number" || field.type === "integer")
        return [
          key,
          {
            ...label,
            type: "number",
            default: Number(field.default),
            min: field.minimum,
            max: field.maximum,
            integer: field.type === "integer",
            step: field.step ?? (field.type === "integer" ? 1 : 0.01),
            hiddenFromList: false,
          },
        ];
      if (field.type === "boolean")
        return [
          key,
          { ...label, type: "boolean", default: Boolean(field.default) },
        ];
      return [
        key,
        {
          ...label,
          type: field.studioType ?? "string",
          default: String(field.default),
        },
      ];
    }),
  );
};

export const overlayMetadata = () => ({
  defaultCodec: "prores" as const,
  defaultVideoImageFormat: "png" as const,
  defaultPixelFormat: "yuva444p10le" as const,
  defaultProResProfile: "4444" as const,
});
