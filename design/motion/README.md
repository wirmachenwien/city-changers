# Reusable Green Fix animations

**This is the editable production project, not the everyday social media kit.**
For a ready-to-send collection with plain-language instructions, use
[the brand handoff](../README.md). Keep this technical reference when editing
the existing Studio rigs; recipients do not need to install Remotion.

Six seamless one-second mascot loops at 4× the original tempo, built from the same SVG geometry and
pose definitions used for the [static kit](../../src/assets/mascot/overview.png).
Editable sources live under `design/`; exported media lives in `src/assets/mascot/`.
The handbook app has no Remotion dependency.

## Preview and customise

From `design/motion/`:

```sh
npm ci
npm run dev
```

Open the URL printed by Studio (it selects a free port automatically), then:

- **Mascot-Library** shows all six motions together on light/dark backgrounds.
- **Transparent-overlays** contains `Mascot-Idle`, `Mascot-Wave`, `Mascot-Point`,
  `Mascot-Celebrate`, `Mascot-Think` and `Mascot-Step`.
- **Social-layouts** contains editable square (1080 × 1080) and portrait
  (1080 × 1920) examples. These are optional templates, not changes to the logo.

### Edit a mascot directly in Studio

Select a **Mascot-…** composition in the left sidebar, then edit its
**Composition → Default Props → Schema** controls on the right. Scroll down
for the action-specific controls. Click a numeric value to type a number, or
drag it. Press Enter to commit; Studio saves the default values back to that
composition's own block in `src/Root.tsx`. No animation-code edits are needed.

Each mascot has its own component in `src/mascots/` and its own schema:

| Composition        | Its controls                                                           |
| ------------------ | ---------------------------------------------------------------------- |
| `Mascot-Idle`      | Loop duration, body bounce/sway, leaf sway                             |
| `Mascot-Wave`      | Whole-arm Rotation keyframes in the part inspector; no hand animation  |
| `Mascot-Point`     | When extension starts, reaches full length, starts returning, finishes |
| `Mascot-Celebrate` | Jump height, jumps per loop, arm swing                                 |
| `Mascot-Think`     | Idea timing, hand X/Y, head tilt, smile, eyes, face colour, rays       |
| `Mascot-Step`      | Steps per loop, boot swing, arm swing, step bounce                     |

For **2 / Wave**, select **Right arm — continuous wave** and edit **Rotation**
keyframes. The fixed stroke swings between −5° and +5° with one eased,
one-second cycle per export. There is no separate hand, tip morph or
procedural arm rotation. Timing and angles are authored as inline Remotion
`interpolate()` keyframes in `WaveRig.tsx`, directly editable in Studio.
For **5 / Think**, increase `gestureHold` to hold the idea longer, lower
`armY` to raise the hand higher, or switch off `showIdeaRays`.
The four gesture timings are fractions of one loop: keep start < raised ≤ hold
< end. During intermediate edits they are safely clamped into order.

In **Mascot-Library**, each mascot is also a separately named timeline item.
Select it to use the labelled inspector controls; double-click to open its
connected standalone composition. Gallery instances and standalone exports have
**independent settings**: editing one does not overwrite the other. Make final
export edits in the standalone composition you will render.

All mascots also expose `loopSeconds`, `treatment`, `size`, `background` and
`animate`. Treatments are **Ink** (`ink`, deep outlines) and **Linen** (`linen`,
warm pale outlines). Linen works over dark footage; Ink works over light
footage. Neither includes a background. Leave `background: transparent` for an overlay.
Set `animate: false` for a still pose. Square overlays are 1080 × 1080, 30
frames at 30 fps: one complete one-second loop. Duplicate the clip in your editor for
longer holds, or trim at a multiple of `loopSeconds` for a seamless shorter loop.
If changing speed or fps, choose a duration containing a whole number of loops.
The step action
walks **in place**, leaving travel/placement to you.

### Edit individual parts and keyframes

Open a standalone mascot, expand **Body motion** in the bottom timeline, and
**click the blue bar** of the part you want to edit. Its controls appear in the
right-hand **Sequence** inspector. You can also select a part in the canvas.
If the timeline is too short, drag its top divider upwards or scroll its rows.

Each mascot has independently authored layers for its body, both boots, both
arms, face/handle, head, eyes, mouth, sprout stem and leaf. Wave uses one
**Right arm — continuous wave** stroke with whole-arm rotation only.
Its preset motion is already off; edit its existing rotation diamonds instead.
Think has separate
**Face — light up**, **Mouth — hmm to smile**, **Idea rays**, and
**Right arm — chin to raised hand** layers.

- **Fine-tune the preset:** leave **Use preset motion** on. Position, rotation,
  scale, pivot and opacity are editable offsets on top of that part's preset.
  Shape, fill, outline and outline width are editable too.
- **Replace its animation:** turn **Use preset motion** off on that part.
  It stops that part's procedural movement, blinking, morphing or fading;
  its parent's movement still applies. Now use your own transform keyframes.
- **Keyframes:** click the diamond beside a property, move the playhead, and
  change its value/add another diamond. Studio writes the keyframes back to
  that mascot's `src/mascots/*Rig.tsx` file. For Wave, rotate/offset the continuous
  arm layer to move the whole arm; there is no hand/tip animation to adjust.
- **Shapes and expressions:** edit **Rest / start shape** and **Target shape**
  with Studio's SVG path controls. For your own shape animation, disable the
  preset and keyframe **Custom morph** from `0` (start) to `1` (target).
  Eyes have their own **Eye opening / blink** control: `0` closes an eye.
  The illuminated face also supports a target fill colour. For the idea rays,
  disable their preset and keyframe opacity to choose when they appear.

Custom keyframes follow the full composition timeline, not the one-second
preset clock. `loopSeconds` retimes presets, not your authored keys. Match the
first and last poses yourself if your customised clip should loop seamlessly.
`animate: false` freezes both preset motion and custom keys at frame zero.

Part edits are **shared by instances of that same mascot** (its gallery preview
and standalone export), but never by the other five mascots. This differs from
whole-instance Props settings, which stay independent. Keep using the whole
mascot controls for quick preset adjustments; use the named layers for detailed
editing. The static PNG/SVG kit and the live-site logo are not rewritten.

The wave rotates one fixed arm stroke using native keyframes. Pointing bends and extends
the arm rather than swinging it. Thinking starts with a hand at the chin,
then the face brightens into a smile, the arm lifts and small yellow idea rays
appear before it settles back. Static artwork and `animate: false` are unchanged.

The social examples expose headline, caption, action and dark mode in Props.
Keep headlines to two short lines and captions to one or two lines; the text
regions have fixed limits. Preview your final copy before exporting, especially
for translated text. Place platform UI/captions in the reserved outer margins.

## Export for a video editor

### Canva / Lottie pack

`npm run export:lottie` generates all 12 animations in
`../../src/assets/mascot/lottie/`. Files follow
`green-fix-{action}-{ink|linen}.json`: all six actions, in Ink and Linen.
The exporter reads current JSX, path morphs, colours and authored keyframes without
changing the source. It supports this mascot rig, not arbitrary Remotion videos.
Unsupported source expressions fail explicitly rather than being ignored.

Use **Canva → Apps → LottieFiles** to import the JSON or access it through your
own LottieFiles workspace: [official integration](https://lottiefiles.com/plugins/canva).
Preview your design and final export in Canva; no files are uploaded automatically.
The host application controls looping for Lottie JSON. Experimental samples and
old preview renders have been removed; automated regression checks are retained.

### ProRes overlays

Current working exports are in `../../src/assets/mascot/video/`: 12 transparent
single-cycle `.mov` files, Ink and Linen for each mascot. `out/mascots-prores/`
is local scratch output and is not used by the handoff packager.
The gallery and optional social templates still have four-second preview
timelines; the six standalone overlay compositions export one second each.
Wave retains extra rotation keyframes for those longer previews, but only its
first complete cycle is exported. If changing `loopSeconds`, match the
standalone composition duration to the new cycle before exporting.

Select an overlay and click **Render** in Studio. Its defaults are
**ProRes 4444 / PNG / yuva444p10le**, which preserve transparency.
Use `.mov` for this export. Import it above your footage in your editor.

Equivalent CLI command, from this folder:

```sh
npx remotion render src/index.ts Mascot-Wave out/mascot-wave.mov --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png
```

For a lighter browser overlay, use transparent VP9 WebM:

```sh
npx remotion render src/index.ts Mascot-Wave out/mascot-wave.webm --codec=vp9 --pixel-format=yuva420p --image-format=png
```

Swap the composition ID for another action. For dark footage, set treatment to
`linen` in Studio, or add `--props='{"treatment":"linen"}'` to the command.

**MP4/H.264 cannot retain transparency.** Social platforms usually need a
finished, opaque video. Use your editor to composite the overlay first, or render
one of the social templates:

```sh
npx remotion render src/index.ts Social-Portrait out/social-portrait.mp4 --codec=h264 --pixel-format=yuv420p
```

`out/` is ignored. Reusable overlays belong in `../../src/assets/mascot/video/`;
finished campaign videos are not part of the kit. Sample text in the social
layouts is placeholder copy, not publication-ready content.

## Reuse in another composition

```tsx
import { AbsoluteFill } from "remotion";
import { Wave } from "./mascots/Wave";

export const MyScene = () => (
  <AbsoluteFill>
    {/* Place above your own footage; transparent artwork, no extra background. */}
    <div
      style={{
        position: "absolute",
        right: 100,
        bottom: 100,
        width: 460,
        height: 460,
      }}
    >
      <Wave
        name="Greeting mascot"
        treatment="linen"
        size={460}
        loopSeconds={1}
      />
    </div>
  </AbsoluteFill>
);
```

The named mascot components own frame-driven motion and are connected to their
standalone compositions. Keep instance controls inline to save Studio edits
back to that instance. They accept `from`, `durationInFrames` and the normal
interactive placement controls; there is no need for an extra timing wrapper.
`Mascot.tsx` is a compatibility dispatcher for the social templates;
`MascotArtwork.tsx` shares the unchanged character geometry, not user settings.
No CSS animations, external assets, network font requests or audio are required.
Blinking, arms, boots and leaf motion are deterministic; loop-boundary tests
check all six actions. Preserve the `design/assets/` and `design/motion/` layout when sharing.

## Checks and maintenance

From the repository root, `npm run design:build` automatically rebuilds stale
stills and animations. An action-local edit rebuilds its two Lotties and two
MOVs; shared motion/default changes rebuild all affected actions. CI and deploy
run the same incremental pipeline automatically. Outputs go directly to
`src/assets/mascot/`, not scratch `out/`. Review generated motion before use.
See [maintenance](../docs/maintenance.md).

```sh
npm run lint
npm run check:motion
npm audit
```

All Remotion packages are pinned to the same version. Zod is intentionally
overridden to **4.6.7**, including transitive copies, to fix
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Remotion currently recommends 4.5.4 and prints a version warning. Do not
downgrade to silence it: type checking and representative frame renders have
been verified with the patched version. Recheck the override when upgrading
Remotion.

The source code follows the repository's AGPL-3.0 license. Remotion's own
[commercial licensing terms](https://www.remotion.dev/license) are separate;
check those before company/production use.
