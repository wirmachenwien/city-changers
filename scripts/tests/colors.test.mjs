import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readRegistry, resolveRegistry, generateOutputs, generatedDifferences, checkContrast, contrastRatio, auditArtwork, auditColors } from '../lib/colors.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const registry = readRegistry(root);
const resolved = resolveRegistry(registry);
const registrySource = readFileSync(join(root, 'design/colors.json'), 'utf8');

function fixture(run) {
  const parent = join(tmpdir(), 'opencode');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'colors-test-'));
  try { run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('three UI families and neutrals preserve the approved primary/artwork colors', () => {
  assert.deepEqual(Object.keys(registry.families).sort(), ['amber', 'green', 'neutral', 'red']);
  assert.equal(resolved.themes.light.paper, '#fdfcf9');
  assert.equal(resolved.themes.dark.paper, '#161511');
  assert.equal(resolved.themes.light.accent, '#0c6b3c');
  assert.equal(resolved.themes.light.warn, '#8a4b00');
  assert.equal(resolved.artwork['mascot-green'], '#176b43');
  assert.equal(resolved.artwork['mascot-yellow'], '#ffd84f');
  assert.equal(resolved.artwork['mascot-ink'], '#20221c');
  assert.notEqual(resolved.artwork['mascot-ink'], resolved.themes.light.ink);
});

test('registered text and essential graphics pass WCAG in light, dark and print', () => {
  const result = checkContrast(registry, resolved);
  assert.deepEqual(result.failures, []);
  assert.ok(result.count >= 60);
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  const broken = { themes: structuredClone(resolved.themes), utilities: resolved.utilities };
  broken.themes.dark.accent = broken.themes.dark.paper;
  assert.ok(checkContrast(registry, broken).failures.some(message => message.startsWith('dark: accent on paper')));
});

test('invalid references, mix weights and alpha values fail before generation', () => {
  const broken = structuredClone(registry);
  broken.tokens.accent.light = 'green.missing';
  assert.throws(() => resolveRegistry(broken), /Unknown color reference/);
  broken.tokens.accent.light = { mix: ['green.light', 'neutral.paper'], weight: 1.1 };
  assert.throws(() => resolveRegistry(broken), /weight\/opacity/);
  broken.tokens.accent.light = 'green.light';
  broken.utilities.scrim.opacity = -1;
  assert.throws(() => resolveRegistry(broken), /weight\/opacity/);
});

test('print shares the UI palette except for explicitly documented overrides', () => {
  for (const name of Object.keys(registry.tokens)) {
    if (!(name in registry.print.overrides)) assert.equal(resolved.themes.print[name], resolved.themes.light[name]);
  }
  assert.equal(resolved.themes.print.paper, '#ffffff');
  assert.equal(resolved.themes.print.warn, '#8a4b00');
});

test('brand palette excludes error red while functional documentation retains its token', () => {
  assert.ok(!registry.palette.some(color => color.ref.startsWith('red.')));
  assert.ok(registry.functionalColors.some(color => color.token === 'error'));
  const guide = readFileSync(join(root, 'design/brand-guide.md'), 'utf8');
  const palette = guide.split('### Brand palette')[1].split('### Functional UI colors')[0];
  const functional = guide.split('### Functional UI colors')[1].split('### Protected artwork colors')[0];
  assert.ok(!palette.includes('#A31F1F'));
  assert.ok(functional.includes('`--error` | `#A31F1F` | `#FF8A7A`'));
  assert.equal(resolved.themes.light.error, '#a31f1f');
  assert.equal(resolved.themes.dark.error, '#ff8a7a');
});

test('generation is idempotent and stale outputs are detected', () => {
  const guide = readFileSync(join(root, 'design/brand-guide.md'), 'utf8');
  const outputs = generateOutputs(registry, resolved, guide, registrySource);
  assert.deepEqual(generateOutputs(registry, resolved, outputs.get('design/brand-guide.md'), registrySource), outputs);
  assert.deepEqual(generatedDifferences(root, outputs), []);
  assert.ok(![...outputs.keys()].some(path => path.startsWith('src/assets/')));
  fixture(directory => {
    for (const [path, content] of outputs) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), content);
    }
    assert.deepEqual(generatedDifferences(directory, outputs), []);
    writeFileSync(join(directory, 'src/styles/colors.generated.css'), 'manually edited');
    assert.deepEqual(generatedDifferences(directory, outputs), ['src/styles/colors.generated.css']);
  });
});

test('color audit rejects hardcoded CSS/JS/MDX colors, but permits tokens and scoped artwork', () => {
  fixture(directory => {
    mkdirSync(join(directory, 'src/assets'), { recursive: true });
    writeFileSync(join(directory, 'src/styles.css'), '.one {color: #0c6b3c}\n.two {background: rgb(1 2 3)}\n.three {color: var(--accent)}\n.four {color: rebeccapurple}\n.five {border: 1px solid tomato}\n.six {box-shadow: 0 0 4px black}');
    writeFileSync(join(directory, 'src/example.tsx'), "const style = {color: 'red'};");
    writeFileSync(join(directory, 'src/example.mdx'), '<span style={{color: "#ff00ff"}}>Text</span>');
    writeFileSync(join(directory, 'src/assets/supplied.svg'), '<svg fill="#fff"/>');
    const policy = { ...registry, audit: { ...registry.audit, scan: ['src'] } };
    const failures = auditColors(directory, policy);
    assert.equal(failures.length, 7);
    assert.ok(failures.some(message => message.includes('src/example.tsx')));
    assert.ok(!failures.some(message => message.includes('supplied.svg')));
    writeFileSync(join(directory, 'src/styles.css'), '.one {color: var(--accent)}');
    writeFileSync(join(directory, 'src/example.tsx'), "const style = {color: 'var(--accent)'};");
    writeFileSync(join(directory, 'src/example.mdx'), '<FeatureBox>Text</FeatureBox>');
    assert.deepEqual(auditColors(directory, policy), []);
  });
});

test('undefined CSS variables fail while registered tokens, local aliases and runtime fallbacks work', () => {
  fixture(directory => {
    mkdirSync(join(directory, 'src'));
    const path = join(directory, 'src/panel.css');
    writeFileSync(path, 'p { color: var(--missing-color) }');
    const failures = auditColors(directory, registry);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /undefined CSS variable --missing-color/);
    writeFileSync(path, ':root { --local-color: var(--accent) } p {color: var(--local-color); padding: var(--runtime-gap, 1rem)}');
    assert.deepEqual(auditColors(directory, registry), []);
  });
});

test('all Git-owned source paths and non-ignored new files are audited, not just src', () => {
  fixture(directory => {
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status, 0);
    mkdirSync(join(directory, 'new-tool'), { recursive: true });
    mkdirSync(join(directory, 'cache'), { recursive: true });
    writeFileSync(join(directory, '.gitignore'), 'cache/\n');
    writeFileSync(join(directory, 'new-tool/panel.html'), '<div style="border: 1px solid tomato">New UI</div>');
    writeFileSync(join(directory, 'cache/output.css'), 'p { color: #ff00ff }');
    const failures = auditColors(directory, registry);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /new-tool\/panel.html/);
  });
});

test('documented artwork colors are verified read-only against protected reference sources', () => {
  assert.deepEqual(auditArtwork(root, registry, resolved), []);
  const broken = { artwork: { ...resolved.artwork, 'mascot-green': '#ff00ff' } };
  assert.ok(auditArtwork(root, registry, broken).some(message => message.includes('mascot-green')));
});

test('the current owned source tree has no unregistered color literals', () => {
  assert.deepEqual(auditColors(root, registry), []);
});
