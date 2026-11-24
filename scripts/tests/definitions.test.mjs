import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { parseHTML } from 'linkedom';
import { renderProse } from '../../src/lib/render-prose.mjs';

test('definition popup content preserves clickable Markdown links and plain-text fallbacks', () => {
  const prose = renderProse('<p>Leiwande Straßen Radar</p>', { lang: 'en', glossary: true });
  const { document } = parseHTML(`<html lang="en"><body>${prose}<button data-definition="Plain &amp; safe">Plain</button></body></html>`);
  const bindings = [];
  const imports = {
    './content-popup': { bindContentPopup: (trigger, options) => bindings.push({ trigger, options }) },
    '../lib/i18n': { t: (_lang, _key, fallback) => fallback },
    '../data/locales': { languages: ['en', 'de', 'sl'] },
  };
  const source = readFileSync(new URL('../../src/scripts/definitions.ts', import.meta.url), 'utf8');
  const script = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(script, { document, exports, require: name => imports[name] });
  exports.initDefinitions();
  assert.equal(bindings.length, 2);
  const radar = bindings[0].options;
  assert.equal(radar.interactive, true);
  const content = radar.content();
  assert.equal(content.querySelector('a').getAttribute('href'), '/resources/awesome-street-radar-en.pdf');
  assert.equal(content.querySelector('a').dataset.cssUnderline, 'text');
  assert.match(content.querySelector('[data-text-link-label]').textContent, /Download/);
  assert.match(content.querySelector('a').textContent, /Download/);
  assert.notEqual(radar.content(), content, 'each popup receives a fresh fragment');
  assert.equal(bindings[1].options.interactive, false);
  const plain = document.createElement('div');
  plain.append(bindings[1].options.content());
  assert.equal(plain.textContent, 'Plain & safe');
  exports.initDefinitions();
  assert.equal(bindings.length, 2, 'reinitializing does not duplicate listeners');
});
