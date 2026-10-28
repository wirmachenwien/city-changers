import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const characters = ["Idle", "Wave", "Point", "Celebrate", "Think", "Step"];
const componentNames = new Set(["MotionPart", "PathPart", "EyePart"]);

for (const character of characters) {
  test(`${character}: every part has its own editable source node`, () => {
    const url = new URL(`../mascots/${character}Rig.tsx`, import.meta.url);
    const file = ts.createSourceFile(
      url.pathname,
      readFileSync(url, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const nodes: (ts.JsxSelfClosingElement | ts.JsxOpeningElement)[] = [];
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        componentNames.has(node.tagName.getText(file))
      )
        nodes.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    const names: string[] = [];
    for (const node of nodes) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const name = attrs.find(
        (a) => a.name.getText(file) === "name",
      )?.initializer;
      assert.ok(
        name && ts.isStringLiteral(name),
        "Timeline names must be literal and independently owned",
      );
      names.push(name.text);
      const style = attrs.find(
        (a) => a.name.getText(file) === "style",
      )?.initializer;
      assert.ok(
        style &&
          ts.isJsxExpression(style) &&
          style.expression &&
          ts.isObjectLiteralExpression(style.expression),
        "Native transforms must be authored inline",
      );
      for (const property of style.expression.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          property.name.getText(file) === "transformOrigin"
        ) {
          assert.ok(
            (ts.isStringLiteral(property.initializer) &&
              property.initializer.text.includes("%")) ||
              ts.isCallExpression(property.initializer),
            "Use Studio-editable percentage pivots or their keyframes",
          );
        }
      }
      if (node.tagName.getText(file) === "PathPart") {
        const d = attrs.find((a) => a.name.getText(file) === "d")?.initializer;
        assert.ok(
          d &&
            (ts.isStringLiteral(d) ||
              (ts.isJsxExpression(d) &&
                d.expression &&
                (ts.isCallExpression(d.expression) ||
                  ts.isStringLiteral(d.expression)))),
          "Path shapes must be editable source literals or inline path keyframes",
        );
      }
    }
    assert.ok(nodes.length >= 13);
    assert.equal(
      new Set(names).size,
      names.length,
      "Part names must be unique within each mascot",
    );
    for (const required of [
      "Body motion",
      "Left boot",
      "Right boot",
      "Left arm",
      "Right arm",
      "Left",
      "Right",
      "Sprout",
      "Leaf",
    ]) {
      assert.ok(
        names.some((name) => name.startsWith(required)),
        `${required} missing`,
      );
    }
    if (character === "Wave")
      assert.ok(names.includes("Right arm — continuous wave"));
    if (character === "Think") assert.ok(names.includes("Idea rays"));
  });
}

test("custom component identities match the authored JSX tags", () => {
  const source = readFileSync(
    new URL("./EditableParts.tsx", import.meta.url),
    "utf8",
  );
  for (const name of componentNames)
    assert.ok(
      source.includes(`componentName: "${name}"`),
      `${name} cannot be selected if its source identity differs`,
    );
});

test("each standalone overlay exports one 30-frame cycle", () => {
  const source = readFileSync(new URL("../Root.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "Root.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let overlays = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(file) === "Composition"
    ) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const id = attrs.find((a) => a.name.getText(file) === "id")?.initializer;
      if (
        id &&
        ts.isStringLiteral(id) &&
        /^Mascot-(Idle|Wave|Point|Celebrate|Think|Step)$/.test(id.text)
      ) {
        const duration = attrs.find(
          (a) => a.name.getText(file) === "durationInFrames",
        )?.initializer;
        assert.ok(
          duration && ts.isJsxExpression(duration) && duration.expression,
        );
        assert.equal(duration.expression.getText(file), "30");
        overlays++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(overlays, 6);
});

test("wave has one fixed stroke and real, looping Remotion rotation keyframes", () => {
  const source = readFileSync(
    new URL("../mascots/WaveRig.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes('name="Hand tip'));
  assert.ok(!source.includes("motion.wrist"));
  assert.ok(!source.includes("motion.rightArm"));
  assert.ok(!source.includes("targetD="));
  assert.ok(!source.includes("presetProgress="));
  const paths = [...source.matchAll(/\bd="(M152,160C[^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(paths, ["M152,160C182,171 210,157 217,138"]);
  const file = ts.createSourceFile(
    "WaveRig.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let rotation: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "interpolate"
    )
      rotation = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(rotation);
  assert.equal(rotation.arguments[0].getText(file), "frame");
  const inputs = rotation.arguments[1];
  const outputs = rotation.arguments[2];
  assert.ok(
    ts.isArrayLiteralExpression(inputs) && ts.isArrayLiteralExpression(outputs),
  );
  assert.equal(inputs.elements.length, outputs.elements.length);
  const values = outputs.elements.map((value) => {
    assert.ok(ts.isStringLiteral(value));
    return value.text;
  });
  assert.equal(
    values[0],
    values[values.length - 1],
    "The clip must join seamlessly",
  );
  assert.ok(values.some((value) => parseFloat(value) > 0));
  assert.ok(values.some((value) => parseFloat(value) < 0));
});
