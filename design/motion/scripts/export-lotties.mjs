/** Export the six current editable mascot rigs as Ink/Linen vector Lotties.
 * Reads current JSX and authored keyframes; never rewrites the editing source.
 * Restricted to this rig's primitives, not a general Remotion converter.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Easing, interpolate, interpolateColors } from "remotion";
import { interpolatePaths } from "@remotion/paths";
import { motionAt, ideaArm } from "../src/motion.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "../../src/assets/mascot/lottie");
const fps = 30;
const lastFrame = 30;
const poses = JSON.parse(
  await fs.readFile(path.join(root, "../assets/mascot/source/poses.json"), "utf8"),
);
const characters = [
  { name: "Idle", action: "idle", pose: "neutral" },
  { name: "Wave", action: "wave", pose: "wave" },
  { name: "Point", action: "point", pose: "point" },
  { name: "Celebrate", action: "celebrate", pose: "celebrate" },
  { name: "Think", action: "think", pose: "think" },
  { name: "Step", action: "step", pose: "step" },
];

function parse(file, text) {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
function evaluate(node, scope) {
  if (!node) return undefined;
  if (
    ts.isJsxExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node)
  )
    return evaluate(node.expression, scope);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node) && node.text in scope) return scope[node.text];
  if (ts.isPropertyAccessExpression(node))
    return evaluate(node.expression, scope)[node.name.text];
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((n) => evaluate(n, scope));
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((p) => {
        if (!ts.isPropertyAssignment(p))
          throw new Error("Only explicit object fields are supported");
        return [p.name.text, evaluate(p.initializer, scope)];
      }),
    );
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
  )
    return -evaluate(node.operand, scope);
  if (ts.isBinaryExpression(node)) {
    const a = evaluate(node.left, scope);
    if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      return a ?? evaluate(node.right, scope);
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      return a && evaluate(node.right, scope);
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      return a || evaluate(node.right, scope);
    const b = evaluate(node.right, scope);
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return a + b;
      case ts.SyntaxKind.MinusToken:
        return a - b;
      case ts.SyntaxKind.AsteriskToken:
        return a * b;
      case ts.SyntaxKind.SlashToken:
        return a / b;
    }
  }
  if (ts.isConditionalExpression(node))
    return evaluate(node.condition, scope)
      ? evaluate(node.whenTrue, scope)
      : evaluate(node.whenFalse, scope);
  if (ts.isTemplateExpression(node))
    return (
      node.head.text +
      node.templateSpans
        .map((s) => String(evaluate(s.expression, scope)) + s.literal.text)
        .join("")
    );
  if (ts.isCallExpression(node)) {
    // Never evaluate arbitrary user code, imports, network requests or statements.
    const name = node.expression.getText();
    const args = node.arguments.map((n) => evaluate(n, scope));
    if (name === "interpolate") return interpolate(...args);
    if (name === "Easing.bezier") return Easing.bezier(...args);
    if (name === "ideaArm") return ideaArm(...args);
  }
  throw new Error(
    `Unsupported JSX expression; stop rather than silently change the artwork: ${node.getText()}`,
  );
}
function attributes(node, scope) {
  return Object.fromEntries(
    node.attributes.properties.map((a) => {
      if (!ts.isJsxAttribute(a))
        throw new Error(
          "Spread props are not supported by the sample exporter",
        );
      return [
        a.name.text,
        a.initializer ? evaluate(a.initializer, scope) : true,
      ];
    }),
  );
}
async function exportMascot(character, treatment) {
  const pose = poses[character.pose];
  const source = parse(
    `${character.name}Rig.tsx`,
    await fs.readFile(
      path.join(root, `src/mascots/${character.name}Rig.tsx`),
      "utf8",
    ),
  );
  const registrations = parse(
    "Root.tsx",
    await fs.readFile(path.join(root, "src/Root.tsx"), "utf8"),
  );
  let input;
  function registration(node) {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText() === "Composition"
    ) {
      const props = node.attributes.properties.filter(ts.isJsxAttribute);
      if (
        props.find((p) => p.name.text === "id")?.initializer?.text ===
        `Mascot-${character.name}`
      )
        input = evaluate(
          props.find((p) => p.name.text === "defaultProps").initializer,
          {},
        );
    }
    ts.forEachChild(node, registration);
  }
  registration(registrations);
  if (!input || input.loopSeconds !== 1)
    throw new Error(
      `${character.name}: expected one complete one-second cycle`,
    );
  input = { ...input, treatment, background: "transparent", animate: true };
  const scopes = Array.from({ length: lastFrame + 1 }, (_, frame) => ({
    frame,
    fps,
    pose,
    animate: true,
    settings: input,
    ideaFaceColor: input.ideaFaceColor ?? "#fff0a8",
    showIdeaRays: input.showIdeaRays ?? true,
    motion: motionAt(character.action, frame / fps, input),
    interpolate,
    Easing,
  }));
  const clean = (value) =>
    JSON.parse(
      JSON.stringify(value, (_, v) =>
        typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v,
      ),
    );
  function property(values) {
    const rounded = values.map(clean);
    if (rounded.every((v) => JSON.stringify(v) === JSON.stringify(rounded[0])))
      return { a: 0, k: rounded[0] };
    return {
      a: 1,
      k: rounded.map((value, t) => ({
        t,
        s: Array.isArray(value) ? value : [value],
        ...(t === lastFrame
          ? {}
          : {
              e: Array.isArray(rounded[t + 1])
                ? rounded[t + 1]
                : [rounded[t + 1]],
              i: { x: 1, y: 1 },
              o: { x: 0, y: 0 },
            }),
      })),
    };
  }
  const constant = (value) => ({ a: 0, k: value });
  const identity = () => ({
    o: constant(100),
    r: constant(0),
    p: constant([0, 0, 0]),
    a: constant([0, 0, 0]),
    s: constant([100, 100, 100]),
  });
  let index = 1;
  const nulls = [],
    paints = [];
  function addNull(name, parent, transforms) {
    const ind = index++;
    nulls.push({
      ddd: 0,
      ind,
      ty: 3,
      nm: name,
      ...(parent ? { parent } : {}),
      sr: 1,
      ks: transforms,
      ip: 0,
      op: 30,
      st: 0,
      bm: 0,
    });
    return ind;
  }
  const scale = input.size / 288;
  const placement = identity();
  placement.p = constant([
    (1080 - input.size) / 2 + 16 * scale,
    (1080 - input.size) / 2 + 16 * scale,
    0,
  ]);
  placement.s = constant([scale * 100, scale * 100, 100]);
  const placementId = addNull("Canvas placement", null, placement);

  function components(text, fallback = [0, 0]) {
    if (text === undefined) return fallback;
    if (typeof text === "number") return [text, text];
    return String(text).split(/\s+/).map(Number);
  }
  function css(style = {}) {
    if (
      Object.keys(style).some(
        (k) =>
          ![
            "translate",
            "rotate",
            "scale",
            "transformOrigin",
            "opacity",
          ].includes(k),
      )
    )
      throw new Error(`Unsupported style in ${character.name} rig`);
    const origin = (style.transformOrigin ?? "0% 0%").split(/\s+/).map((v) => {
      if (!v.endsWith("%")) throw new Error("Expected SVG percentage pivot");
      return -16 + parseFloat(v) * 2.88;
    });
    const translate = String(style.translate ?? "0px 0px")
      .split(/\s+/)
      .map(parseFloat);
    const scales = components(style.scale, [1, 1]);
    return {
      anchor: [...origin, 0],
      position: [origin[0] + translate[0], origin[1] + (translate[1] ?? 0), 0],
      rotation: parseFloat(style.rotate ?? "0"),
      scale: [scales[0] * 100, (scales[1] ?? scales[0]) * 100, 100],
      opacity: (style.opacity ?? 1) * 100,
    };
  }
  function svg(text) {
    let x = 0,
      y = 0,
      r = 0,
      ax = 0,
      ay = 0;
    if (text) {
      const tokens = [...text.matchAll(/(translate|rotate)\(([^)]+)\)/g)];
      if (
        !tokens.length ||
        tokens
          .map((m) => m[0])
          .join("")
          .replace(/\s/g, "") !== text.replace(/\s/g, "")
      )
        throw new Error(`Unsupported transform: ${text}`);
      for (const [, type, args] of tokens) {
        const n = args
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        if (type === "translate") {
          x = n[0];
          y = n[1] ?? 0;
        } else {
          r = n[0];
          ax = n[1] ?? 0;
          ay = n[2] ?? 0;
        }
      }
    }
    return {
      anchor: [ax, ay, 0],
      position: [ax + x, ay + y, 0],
      rotation: r,
      scale: [100, 100, 100],
      opacity: 100,
    };
  }
  function transforms(frames) {
    return {
      a: property(frames.map((v) => v.anchor)),
      p: property(frames.map((v) => v.position)),
      r: property(frames.map((v) => v.rotation)),
      s: property(frames.map((v) => v.scale)),
      o: property(frames.map((v) => v.opacity)),
    };
  }

  /** SVG M/L/C/Q/Z -> Lottie cubic vertices, with relative Bezier tangents. */
  function vector(d) {
    const tokens = d.match(
      /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g,
    );
    const v = [],
      i = [],
      o = [];
    let closed = false,
      p = 0,
      command;
    const num = () => Number(tokens[p++]);
    const append = (x, y, incoming = [0, 0]) => {
      v.push([x, y]);
      i.push(incoming);
      o.push([0, 0]);
    };
    while (p < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[p])) command = tokens[p++];
      if (command === "M") {
        if (v.length)
          throw new Error(
            "Split compound paths before converting to cubic vertices",
          );
        append(num(), num());
        command = "L";
      } else if (command === "L") append(num(), num());
      else if (command === "C") {
        const c1 = [num(), num()],
          c2 = [num(), num()],
          end = [num(), num()],
          last = v[v.length - 1];
        o[o.length - 1] = [c1[0] - last[0], c1[1] - last[1]];
        append(...end, [c2[0] - end[0], c2[1] - end[1]]);
      } else if (command === "Q") {
        const c = [num(), num()],
          end = [num(), num()],
          last = v[v.length - 1];
        o[o.length - 1] = [
          ((c[0] - last[0]) * 2) / 3,
          ((c[1] - last[1]) * 2) / 3,
        ];
        append(...end, [((c[0] - end[0]) * 2) / 3, ((c[1] - end[1]) * 2) / 3]);
      } else if (command === "Z") {
        closed = true;
        command = undefined;
      } else throw new Error(`Unsupported SVG command: ${command}`);
    }
    if (
      closed &&
      v.length > 1 &&
      JSON.stringify(v[0]) === JSON.stringify(v[v.length - 1])
    ) {
      i[0] = i.pop();
      v.pop();
      o.pop();
    }
    return clean({ v, i, o, c: closed });
  }
  const colour = (hex) => {
    const rgb = hex.match(/^rgba?\(([^)]+)\)$/);
    if (rgb) {
      const n = rgb[1].split(/[,\s]+/).map(Number);
      return [n[0] / 255, n[1] / 255, n[2] / 255, n[3] ?? 1].map(
        (v) => Math.ceil(v * 1e6) / 1e6,
      );
    }
    if (!/^#[0-9a-f]{6}$/i.test(hex))
      throw new Error(`Unsupported colour ${hex}`);
    return [1, 3, 5]
      .map((n) => parseInt(hex.slice(n, n + 2), 16) / 255)
      .concat(1)
      .map((v) => Math.ceil(v * 1e6) / 1e6);
  };
  function draw(tag, frames, parent) {
    const first = frames[0],
      shapes = [];
    if (tag === "PathPart") {
      const geometry = frames.map((f) => {
        const amount = Math.max(
          0,
          Math.min(
            1,
            f.usePresetMotion !== false
              ? (f.presetProgress ?? 0)
              : (f.progress ?? 0),
          ),
        );
        const end =
          f.usePresetMotion !== false &&
          f.targetD === f.defaultTargetD &&
          f.presetTargetD
            ? f.presetTargetD
            : f.targetD;
        const d =
          !end || amount === 0
            ? f.d
            : amount === 1
              ? end
              : interpolatePaths(amount, [0, 1], [f.d, end]);
        const subpaths = d.match(/M[^M]*/g);
        if (!subpaths?.length)
          throw new Error(`Unsupported path syntax in ${f.name}: ${d}`);
        return subpaths.map(vector);
      });
      for (let part = 0; part < geometry[0].length; part++) {
        if (
          geometry.some(
            (paths) =>
              paths.length !== geometry[0].length ||
              paths[part].v.length !== geometry[0][part].v.length,
          )
        )
          throw new Error(`Morph topology changed in ${first.name}`);
        shapes.push({
          ty: "sh",
          nm: first.name,
          ks: property(geometry.map((paths) => paths[part])),
        });
      }
    } else {
      shapes.push({
        ty: "el",
        d: 1,
        p: property(frames.map((f) => [f.cx, f.cy])),
        s: property(
          frames.map((f, n) => [
            2 * (f.rx ?? 4),
            2 *
              Math.max(
                0,
                ((f.ry ?? 7) +
                  (f.usePresetMotion !== false
                    ? scopes[n].motion.idea * (input.eyeOpen ?? 3)
                    : 0)) *
                  (f.openness ?? 1) *
                  (f.usePresetMotion !== false ? scopes[n].motion.blink : 1),
              ),
          ]),
        ),
      });
    }
    const palette = (value, faceDetail = false) =>
      treatment === "linen" && !faceDetail && value === "#20221c"
        ? "#cbbf9f"
        : value;
    const fill = first.fill ?? "none",
      stroke = first.stroke ?? "none";
    if (stroke !== "none")
      shapes.push({
        ty: "st",
        nm: "Outline",
        c: property(
          frames.map((f) =>
            colour(palette(f.stroke ?? "#20221c", f.faceDetail)),
          ),
        ),
        o: constant(100),
        w: property(frames.map((f) => f.strokeWidth ?? 0)),
        lc: first.strokeLinecap === "butt" ? 1 : 2,
        lj: first.strokeLinejoin === "miter" ? 1 : 2,
        ml: 4,
      });
    // Lottie paints styles in reverse order: fill first, outline on top, like SVG.
    if (fill !== "none")
      shapes.push({
        ty: "fl",
        nm: "Fill",
        c: property(
          frames.map((f) => {
            const base = tag === "EyePart" ? f.fill : palette(f.fill);
            const end = f.targetFill ?? f.presetTargetFill;
            const amount = Math.max(
              0,
              Math.min(
                1,
                f.usePresetMotion !== false
                  ? (f.presetProgress ?? 0)
                  : (f.progress ?? 0),
              ),
            );
            return colour(
              end
                ? interpolateColors(amount, [0, 1], [base, palette(end)])
                : base,
            );
          }),
        ),
        o: constant(100),
        r: 1,
      });
    shapes.push({
      ty: "tr",
      p: constant([0, 0]),
      a: constant([0, 0]),
      s: constant([100, 100]),
      r: constant(0),
      o: constant(100),
      sk: constant(0),
      sa: constant(0),
    });
    const local = frames.map((f) => {
      const t = svg(
        f.usePresetMotion !== false ? f.presetTransform : f.baseTransform,
      );
      t.opacity =
        f.usePresetMotion !== false ? (f.presetOpacity ?? 1) * 100 : 100;
      return t;
    });
    paints.push({
      ddd: 0,
      ind: index++,
      ty: 4,
      nm: first.name,
      parent,
      sr: 1,
      ks: transforms(local),
      ao: 0,
      shapes: [
        {
          ty: "gr",
          nm: first.name,
          it: shapes,
          np: shapes.length,
          cix: 2,
          bm: 0,
        },
      ],
      ip: 0,
      op: 30,
      st: 0,
      bm: 0,
    });
  }
  function visit(node, parent) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText();
      if (!["MotionPart", "PathPart", "EyePart"].includes(tag))
        throw new Error(`Unsupported rig component ${tag}`);
      const frames = scopes.map((s) => attributes(opening, s));
      const styled = addNull(
        `${frames[0].name} — local controls`,
        parent,
        transforms(frames.map((f) => css(f.style))),
      );
      if (tag === "MotionPart") {
        const transformed = addNull(
          frames[0].name,
          styled,
          transforms(
            frames.map((f) => {
              const result = svg(
                f.usePresetMotion !== false
                  ? f.presetTransform
                  : f.baseTransform,
              );
              result.opacity =
                f.usePresetMotion !== false
                  ? (f.presetOpacity ?? 1) * 100
                  : 100;
              return result;
            }),
          ),
        );
        for (const child of node.children)
          if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
            visit(child, transformed);
      } else draw(tag, frames, styled);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, parent));
  }
  visit(source, placementId);
  if (paints.length < 11) throw new Error(`${character.name}: incomplete rig`);
  const animation = {
    v: "5.12.2",
    fr: fps,
    ip: 0,
    op: 30,
    w: 1080,
    h: 1080,
    nm: `The Green Fix — ${character.name} — ${treatment === "ink" ? "Ink" : "Linen"}`,
    ddd: 0,
    assets: [],
    layers: [...paints.reverse(), ...nulls],
    markers: [],
    meta: {
      g: "City Changers; sampled from current editable JSX at 30 fps",
    },
  };
  await fs.mkdir(out, { recursive: true });
  const filename = `green-fix-${character.action}-${treatment}.json`;
  const output = path.join(out, filename);
  await fs.writeFile(output, JSON.stringify(animation));
  const bytes = (await fs.stat(output)).size;
  console.log(`${filename}: ${(bytes / 1024).toFixed(1)} KB`);
  return { file: filename, mascot: character.action, treatment, bytes };
}

const files = [];
const requested = process.argv.slice(2);
if (requested.some((action) => !characters.some((c) => c.action === action)))
  throw new Error(`Unknown action: ${requested.join(", ")}`);
for (const character of characters)
  for (const treatment of ["ink", "linen"])
    if (requested.length === 0 || requested.includes(character.action))
      await exportMascot(character, treatment);
// Retain a complete inventory even when only one action was rebuilt.
for (const character of characters)
  for (const treatment of ["ink", "linen"]) {
    const file = `green-fix-${character.action}-${treatment}.json`;
    files.push({ file, mascot: character.action, treatment,
      bytes: (await fs.stat(path.join(out, file))).size });
  }
await fs.writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(
    {
      width: 1080,
      height: 1080,
      fps: 30,
      frames: 30,
      transparent: true,
      vectorOnly: true,
      treatments: {
        ink: { outline: "#20221c", recommendedBackground: "light" },
        linen: { outline: "#cbbf9f", recommendedBackground: "dark" },
      },
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Lottie inventory: ${files.length} files in ${out}`);
