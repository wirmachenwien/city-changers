import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { commonSchema, studioSchema } from "./mascots/controls.ts";
import {
  ideaArm,
  ideaMouth,
  LOOP_SECONDS,
  motionAt,
  pointingArm,
  type MotionName,
} from "./motion.ts";

const actions: MotionName[] = [
  "idle",
  "wave",
  "point",
  "celebrate",
  "think",
  "step",
];
for (const action of actions) {
  test(`${action}: identical loop boundaries and deterministic frames`, () => {
    for (const time of [0, 0.07, 0.37, 0.5, 0.7, 0.85, 0.99]) {
      const first = motionAt(action, time);
      const next = motionAt(action, time + LOOP_SECONDS);
      assert.deepEqual(first, motionAt(action, time));
      for (const key of Object.keys(first) as (keyof typeof first)[]) {
        assert.ok(
          Math.abs(first[key] - next[key]) < 1e-9,
          `${key} jumps at ${time}`,
        );
        assert.ok(Number.isFinite(first[key]));
      }
    }
  });
}

test("4× tempo gives a one-second loop", () => {
  assert.equal(LOOP_SECONDS, 1);
});

test("wave has independent arm and wrist motion", () => {
  const initial = motionAt("wave", 0);
  assert.equal(initial.rightArm, 0);
  assert.ok(Math.abs(initial.wrist) > 20);
  assert.notEqual(motionAt("wave", 0.08).wrist, initial.wrist);
});

test("point extends, holds and retracts instead of rotating", () => {
  assert.equal(motionAt("point", 0).reach, 0);
  assert.equal(motionAt("point", 0.5).reach, 1);
  assert.equal(motionAt("point", 0.99).reach, 0);
  assert.equal(motionAt("point", 0.5).rightArm, 0);
  assert.equal(pointingArm(0), "M152,160C173.333,164 184,157.667 184,141");
  assert.equal(pointingArm(1), "M152,160C177,166 199,150 226,150");
});

test("thinking resolves to an idea, raised arm and smile, then resets", () => {
  assert.equal(motionAt("think", 0.1).idea, 0);
  assert.equal(motionAt("think", 0.55).idea, 1);
  assert.equal(motionAt("think", 0.99).idea, 0);
  assert.equal(ideaArm(0), "M152,163C178,167 174,193 143,184");
  assert.equal(ideaArm(1), "M152,163C188,178 226,150 224,112");
  assert.equal(ideaMouth(1), "M115,178C124,191 134,191 143,176");
});

test("mascot-specific edits do not mutate other mascots or global defaults", () => {
  const before = motionAt("think", 0.55);
  const edited = motionAt("wave", 0.15, {
    armSwing: 0,
    wristSwing: 0,
    waves: 1,
    loopSeconds: 2,
  });
  assert.equal(edited.rightArm, 0);
  assert.equal(edited.wrist, 0);
  assert.deepEqual(motionAt("think", 0.55), before);
  assert.notEqual(motionAt("wave", 0.15).wrist, 0);
});

test("custom loop duration and cycle counts remain seamless", () => {
  for (const action of actions) {
    const settings = {
      loopSeconds: 2,
      waves: 2,
      jumps: 3,
      steps: 1,
      wristPhase: 30,
    };
    const first = motionAt(action, 0.35, settings);
    const next = motionAt(action, 2.35, settings);
    for (const key of Object.keys(first) as (keyof typeof first)[]) {
      assert.ok(Math.abs(first[key] - next[key]) < 1e-9);
    }
  }
});

test("timing controls stay finite while markers are being reordered", () => {
  for (const action of ["point", "think"] as const) {
    for (let frame = 0; frame < 30; frame++) {
      const result = motionAt(action, frame / 30, {
        gestureStart: 0.9,
        gestureRaised: 0.1,
        gestureHold: 0.05,
        gestureEnd: 0.02,
      });
      assert.ok(Object.values(result).every(Number.isFinite));
      assert.ok(result.idea >= 0 && result.idea <= 1);
      assert.ok(result.reach >= 0 && result.reach <= 1);
    }
  }
});

test("Studio inspector and composition Props share the same defaults and limits", () => {
  const editor = studioSchema(commonSchema);
  const defaults = commonSchema.parse({});
  for (const [key, value] of Object.entries(defaults)) {
    assert.equal(
      "default" in editor[key] ? editor[key].default : undefined,
      value,
    );
  }
  assert.equal(editor.loopSeconds.type, "number");
  assert.equal(editor.treatment.type, "enum");
  if (editor.loopSeconds.type === "number") {
    assert.equal(editor.loopSeconds.min, 0.25);
    assert.equal(editor.loopSeconds.max, 8);
  }
  const custom = studioSchema(
    z.object({
      colour: z.string().default("#fff0a8").meta({ studioType: "color" }),
      path: z.string().default("M0,0L1,1").meta({ studioType: "svg-path" }),
      cycles: z.number().int().min(1).max(6).default(3),
    }),
  );
  assert.equal(custom.colour.type, "color");
  assert.equal(custom.path.type, "svg-path");
  assert.equal(custom.cycles.type === "number" && custom.cycles.integer, true);
});
