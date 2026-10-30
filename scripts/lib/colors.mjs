import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const readRegistry = (root) => JSON.parse(readFileSync(join(root, 'design/colors.json'), 'utf8'));

export function parseHex(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`Expected six-digit HEX, got ${value}`);
  return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16)).concat(1);
}

export function serializeColor([r, g, b, a = 1]) {
  const rgb = [r, g, b].map(channel => Math.round(channel));
  return a === 1 ? `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
    : `rgba(${rgb.join(', ')}, ${Number(a.toFixed(4))})`;
}

export function resolveRegistry(registry) {
  if (registry.version !== 1) throw new Error('Unsupported color registry version');
  const bases = {};
  for (const [family, shades] of Object.entries(registry.families)) {
    if (!['neutral', 'green', 'amber', 'red'].includes(family)) throw new Error(`Unregistered color family: ${family}`);
    for (const [shade, value] of Object.entries(shades)) bases[`${family}.${shade}`] = parseHex(value);
  }
  function fraction(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Invalid color weight/opacity: ${value}`);
    return value;
  }
  function resolve(expression) {
    if (typeof expression === 'string') {
      if (!bases[expression]) throw new Error(`Unknown color reference: ${expression}`);
      return bases[expression];
    }
    if (!expression || typeof expression !== 'object') throw new Error('Invalid color expression');
    if (expression.ref) return resolve(expression.ref);
    if (expression.value) return parseHex(expression.value);
    if (expression.mix) {
      if (!Array.isArray(expression.mix) || expression.mix.length !== 2) throw new Error('A mix needs exactly two colors');
      const weight = fraction(expression.weight);
      const [a, b] = expression.mix.map(resolve);
      if (a[3] !== 1 || b[3] !== 1) throw new Error('Mix opaque bases; apply opacity afterward');
      return a.map((channel, index) => index === 3 ? 1 : channel * weight + b[index] * (1 - weight));
    }
    if (expression.alpha) return [...resolve(expression.alpha).slice(0, 3), fraction(expression.opacity)];
    throw new Error(`Unknown color expression: ${JSON.stringify(expression)}`);
  }
  const utilities = Object.fromEntries(Object.entries(registry.utilities).map(([name, expression]) => [name, serializeColor(resolve(expression))]));
  for (const name of [...Object.keys(utilities), ...Object.keys(registry.tokens)]) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid CSS color token name: ${name}`);
  }
  if (Object.keys(utilities).some(name => name in registry.tokens)) throw new Error('Utility and theme color names must not overlap');
  const themes = {};
  for (const mode of ['light', 'dark']) {
    themes[mode] = Object.fromEntries(Object.entries(registry.tokens).map(([name, token]) => [name, serializeColor(resolve(token[mode]))]));
  }
  themes.print = { ...themes.light };
  for (const [name, expression] of Object.entries(registry.print.overrides)) {
    if (!(name in registry.tokens)) throw new Error(`Unknown print token: ${name}`);
    themes.print[name] = serializeColor(resolve(expression));
  }
  const artwork = Object.fromEntries(Object.entries(registry.artwork).map(([name, expression]) => [name, serializeColor(resolve(expression))]));
  return { themes, utilities, artwork, resolve };
}

function luminance(hex) {
  const channels = parseHex(hex).slice(0, 3).map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function checkContrast(registry, resolved) {
  const failures = [];
  let count = 0;
  for (const [mode, theme] of Object.entries(resolved.themes)) {
    const tokens = { ...resolved.utilities, ...theme };
    for (const [kind, minimum] of [['text', 4.5], ['graphics', 3], ['qr', 7]]) {
      for (const [foreground, background] of registry.contrast[kind] ?? []) {
        if (!tokens[foreground] || !tokens[background]) throw new Error(`Unknown contrast token: ${foreground}/${background}`);
        const ratio = contrastRatio(tokens[foreground], tokens[background]);
        count++;
        if (ratio < minimum) failures.push(`${mode}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1; requires ${minimum}:1`);
      }
    }
  }
  return { failures, count };
}

const declarations = tokens => Object.entries(tokens).map(([name, value]) => `  --${name}: ${value};`).join('\n');
const title = name => name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
// CSS named colors, excluding transparent/currentColor and system colors.
const namedColors = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');

export function generateOutputs(registry, resolved, guide, registrySource = JSON.stringify(registry)) {
  const { themes, utilities, artwork } = resolved;
  const generated = '/* Generated from design/colors.json. Run npm run colors:generate; do not edit. */\n';
  const css = generated +
    `:root {\n  color-scheme: light dark;\n${declarations({ ...utilities, ...themes.light })}\n}\n\n` +
    `:root[data-theme="light"] {\n  color-scheme: light;\n${declarations(themes.light)}\n}\n\n` +
    `:root[data-theme="dark"] {\n  color-scheme: dark;\n${declarations(themes.dark)}\n}\n\n` +
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n    color-scheme: dark;\n${declarations(themes.dark).replace(/^/gm, '  ')}\n  }\n}\n\n` +
    `@media print {\n  :root, :root[data-theme], :root:not([data-theme]) {\n    color-scheme: light;\n${declarations(themes.print).replace(/^/gm, '  ')}\n  }\n}\n`;
  const rows = registry.palette.map(color => `${color.name.padEnd(18)}${serializeColor(resolved.resolve(color.ref)).toUpperCase()}   ${color.use}`).join('\n');
  const artRows = Object.entries(artwork).map(([name, value]) => `| ${title(name)} | \`${value.toUpperCase()}\` | ${registry.artwork[name].use} |`).join('\n');
  const functionalRows = registry.functionalColors.map(({ name, token }) => {
    if (!registry.tokens[token]) throw new Error(`Unknown functional color token: ${token}`);
    return `| ${name} | \`--${token}\` | \`${themes.light[token].toUpperCase()}\` | \`${themes.dark[token].toUpperCase()}\` | ${registry.tokens[token].use} |`;
  }).join('\n');
  const colorsSection = `## Colors

{/* Generated from design/colors.json by npm run colors:generate. */}
### Brand palette

Our brand palette uses **green** as its primary accent and **warm amber/brown**
for supporting emphasis, with paper and ink neutrals. Red is a functional UI
color, not a brand accent. Supporting shades are derived recipes, not
additional brand colors to choose independently.

Enter these HEX codes in your design app's color picker:

<BrandPalette />

<details>
<summary>Copyable color values</summary>

\`\`\`text
${rows}
\`\`\`

</details>

Use the semantic light/dark tokens for interfaces, rather than applying these
base colors to every background. Warm FeatureBoxes use the amber accent with
its generated tint. The detailed light/dark/export values, utilities and recipes
are in **COLOR-REFERENCE.md**, also available in the brand kit.

### Functional UI colors

These colors communicate an interface role, not a brand mood. Green and amber
reuse the brand families; red is reserved for errors and incorrect-answer
feedback. Always accompany status colors with text or another non-color cue.
Warm callouts are emphasis, not automatically warnings.

The light and dark values below come from the semantic tokens. Use the tokens
in interfaces, not fixed HEX values. Borders, muted text and focus indicators
are UI utilities, not additional brand accents.

<TableWrap>

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
${functionalRows}

</TableWrap>

### Protected artwork colors

<TableWrap>

| Name | HEX | Use |
|---|---|---|
${artRows}

</TableWrap>

Keep supplied artwork unchanged. Website ink and mascot ink are intentionally
different. These colors are not permission to recolor a mascot or partner logo.
Pale artwork outlines are not intended as small text colors.

Use CSS tokens for UI text/background pairs; automated checks cover registered
text and icon combinations, not arbitrary text over photos. Review image
contrast separately. Print uses white paper and documented neutral overrides;
it does not invent another green or amber palette. Screen colors are not a
print/CMYK specification: ask a printer for proofs.

<BrandColorReference />

`;
  if (!/^## Colors\s*$/m.test(guide) || !/^## Type\s*$/m.test(guide)) throw new Error('Brand guide must contain Colors and Type sections');
  const nextGuide = guide.replace(/^## Colors\s*$[\s\S]*?(?=^## Type\s*$)/m, colorsSection);
  const recipes = expression => typeof expression === 'string' ? expression : expression.mix
    ? `${expression.mix[0]} ${expression.weight * 100}% + ${expression.mix[1]} ${Math.round((1 - expression.weight) * 100)}% (sRGB)`
    : expression.alpha ? `${expression.alpha} at ${expression.opacity * 100}% opacity` : expression.ref ?? expression.value;
  const reference = `# City Changers — technical color reference

<!-- Generated from design/colors.json. Do not edit; run npm run colors:generate. -->
The brand guide separates the brand palette, functional UI colors and protected
artwork colors. This table is an implementation
reference, not a menu of interchangeable accents. Edit \`design/colors.json\`,
run \`npm run colors:generate\`, then \`npm run colors:check\`.
## Theme tokens

Use \`var(--token)\` in UI styles. Recipes mix opaque bases in sRGB, rounded to
8-bit channels before contrast is checked. Light/dark accent bases remain
explicit so contrast is not left to arbitrary automatic mixing.

| Token | Light | Dark | Print/export | Purpose |
|---|---|---|---|---|
${Object.entries(registry.tokens).map(([name, token]) => `| \`--${name}\` | \`${themes.light[name].toUpperCase()}\` | \`${themes.dark[name].toUpperCase()}\` | \`${themes.print[name].toUpperCase()}\` | ${token.use} |`).join('\n')}

## Supporting recipes

| Token | Light recipe | Dark recipe |
|---|---|---|
${Object.entries(registry.tokens).filter(([, token]) => typeof token.light !== 'string' || typeof token.dark !== 'string').map(([name, token]) => `| ${name} | ${recipes(token.light)} | ${recipes(token.dark)} |`).join('\n')}

## Utilities

These support QR codes, protected artwork backings, overlays and shadows; they
are not additional brand accents. Transparent and currentColor are also allowed.

| Token | Value | Source |
|---|---|---|
${Object.entries(utilities).map(([name, value]) => `| \`--${name}\` | \`${value}\` | ${recipes(registry.utilities[name])} |`).join('\n')}

## Print exceptions

${registry.print.description}

${Object.entries(registry.print.overrides).map(([name, expression]) => `- **${name}:** ${recipes(expression)}.`).join('\n')}

Legacy export-only green/amber fills and arbitrary print grays are consolidated
into these tokens. PDF/EPUB builders materialize literal CSS values so older
readers do not need CSS custom-property support.

## Protected artwork

| Name | HEX | Use |
|---|---|---|
${artRows}

Colors in partner logos, photos and license badges remain external artwork.
Changing this registry never regenerates mascot SVGs, Lotties or videos.

## Enforcement and exceptions

Run \`npm run colors:check\` before committing. It checks generated-file freshness,
registered contrast pairs (4.5:1 text; 3:1 essential graphics; 7:1 QR codes), and literal color
drift in owned source code. CI runs the same check. Decorative separators are
not tested as control boundaries; image overlays require visual review.

The audit includes all tracked and non-ignored new source files, not only the
current source folders. Shorthand declarations and inline styles are checked too.
CSS variable references without a fallback must resolve to a registered token
or a defined local alias. Direct Astro, PDF/EPUB and brand-kit entrypoints also
reject generated colors whose source-registry fingerprint is out of date.
Protected artwork palette references are compared read-only with their source
assets; changing a documented artwork color cannot silently mislabel the assets.

Literal-color exceptions are limited to generated outputs, tests and protected
artwork/tooling. Each exception is listed with its reason in the registry.

${[...registry.audit.exceptions, ...registry.audit.protected].map(item => `- \`${item.path}\`: ${item.reason}`).join('\n')}
`;
  return new Map([
    ['src/styles/colors.generated.css', css],
    ['src/data/colors.generated.json', JSON.stringify({ registrySha256: createHash('sha256').update(registrySource).digest('hex'), themes, utilities, artwork }, null, 2) + '\n'],
    ['design/brand-guide.mdx', nextGuide],
    ['design/colors-reference.md', reference],
  ]);
}

export function generatedDifferences(root, outputs) {
  return [...outputs].filter(([path, content]) => !existsSync(join(root, path)) || readFileSync(join(root, path), 'utf8') !== content).map(([path]) => path);
}

export function auditArtwork(root, registry, resolved) {
  const failures = [];
  for (const [name, entry] of Object.entries(registry.artwork)) {
    if (!entry.sources?.length) throw new Error(`Protected artwork needs reference sources: ${name}`);
    for (const source of entry.sources) {
      const path = join(root, source);
      const colors = existsSync(path) ? readFileSync(path, 'utf8').toLowerCase().match(/#[\da-f]{6}\b/g) ?? [] : [];
      if (!colors.includes(resolved.artwork[name])) {
        failures.push(`${source}: documented artwork color ${name} (${resolved.artwork[name]}) does not match the protected source; review, do not regenerate automatically`);
      }
    }
  }
  return failures;
}

export function auditColors(root, registry) {
  const failures = [];
  const definitions = new Set([...Object.keys(registry.tokens ?? {}), ...Object.keys(registry.utilities ?? {})].map(name => `--${name}`));
  const references = [];
  const ignored = [...registry.audit.exceptions, ...registry.audit.protected].map(item => {
    if (!item.reason?.trim()) throw new Error(`Color audit exception needs a reason: ${item.path}`);
    return item.path;
  });
  const literal = new RegExp(String.raw`(?<!&)#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix|device-cmyk)\s*\(|\b(?:color|background(?:-color|Color)?|fill|stroke)["']?\s*[:=]\s*["']?(?:${namedColors.join('|')})\b`, 'gi');
  const shorthand = /\b(?:border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|outline|box-shadow|boxShadow|text-shadow|textShadow|column-rule|text-decoration|background(?:-image|Image)?)["']?\s*:\s*([^;}\n]+)/g;
  const named = new RegExp(String.raw`(?<![\w./-])(?:${namedColors.join('|')})(?![\w./-])`, 'i');
  function inspect(path, name) {
    if (!['.css', '.astro', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.py', '.mdx', '.html', '.svg', '.json', '.yml', '.yaml'].includes(extname(path))) return;
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
      for (const declaration of line.matchAll(/(--[a-z][\w-]*)["']?\s*:/gi)) definitions.add(declaration[1]);
      for (const assignment of line.matchAll(/setProperty\(\s*["'](--[a-z][\w-]*)["']/gi)) definitions.add(assignment[1]);
      // An explicit fallback may intentionally cover a runtime variable.
      for (const reference of line.matchAll(/var\(\s*(--[a-z][\w-]*)\s*\)/gi)) references.push({ name, line: index + 1, token: reference[1] });
      literal.lastIndex = 0;
      let match = literal.exec(line);
      if (!match) {
        shorthand.lastIndex = 0;
        for (const declaration of line.matchAll(shorthand)) {
          match = named.exec(declaration[1].replace(/url\([^)]*\)/gi, ''));
          if (match) break;
        }
      }
      if (match) failures.push(`${name}:${index + 1}: unregistered color literal ${match[0]}; use a semantic token`);
    });
  }
  const selected = name => registry.audit.scan.some(prefix => prefix === '.' || name === prefix || name.startsWith(prefix + '/'));
  const skip = name => ignored.some(prefix => name === prefix || name.startsWith(prefix + '/'));
  function finish() {
    for (const reference of references) {
      if (!definitions.has(reference.token)) failures.push(`${reference.name}:${reference.line}: undefined CSS variable ${reference.token}; use a registry token or a defined alias`);
    }
    return failures;
  }
  const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
  if (git.status === 0) {
    for (const name of new Set(git.stdout.split('\0').filter(Boolean))) {
      const path = join(root, name);
      if (selected(name) && !skip(name) && existsSync(path) && !lstatSync(path).isSymbolicLink()) inspect(path, name);
    }
    return finish();
  }
  // Non-Git source distributions and isolated test fixtures use the same
  // explicit policy, without walking dependency/build caches.
  function walk(path) {
    const name = relative(root, path).replaceAll('\\', '/');
    if (skip(name) || /(?:^|\/)(?:__pycache__|node_modules|dist|\.git|\.astro|\.cache)(?:\/|$)/.test(name)) return;
    let entries;
    try { entries = readdirSync(path, { withFileTypes: true }); } catch { /* File, handled below. */ }
    if (entries) { for (const entry of entries) if (!entry.isSymbolicLink()) walk(join(path, entry.name)); return; }
    inspect(path, name);
  }
  for (const path of registry.audit.scan) walk(join(root, path));
  return finish();
}
