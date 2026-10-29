import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { parseHTML } from 'linkedom';

function environment() {
  const { document, HTMLElement, Node, Event } = parseHTML(`<html lang="en"><body><main data-prose>
    <p>Text<button id="ref-note-1" data-footnote-ref data-footnote-number="1" aria-describedby="note-1"><sup>1</sup></button>
    <span id="note-1" hidden>A useful footnote.</span></p></main></body></html>`);
  Object.defineProperties(document.documentElement, {
    clientWidth: { value: 1000 }, clientHeight: { value: 800 },
  });
  HTMLElement.prototype.getBoundingClientRect = () => ({
    top: 100, bottom: 120, left: 100, right: 120, width: 20, height: 20,
  });
  const navigation = [];
  const scrolls = [];
  HTMLElement.prototype.scrollIntoView = function (options) { scrolls.push({ id: this.id, options }); };
  const location = {
    hash: '',
    assign(href) {
      // The popup must already be gone when navigation starts.
      assert.equal(document.querySelector('.content-popup'), null);
      navigation.push(href);
      this.hash = new URL(href, 'https://example.org/book/chapter.html').hash;
    },
  };
  const globals = {
    document, HTMLElement, Node,
    window: { location, addEventListener() {}, removeEventListener() {} },
    history: { pushState: (_state, _title, hash) => { location.hash = hash; } },
    getComputedStyle: () => ({ inlineSize: '32px' }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout, clearTimeout,
  };
  const imports = {
    '../data/locales': { languages: ['en', 'de', 'sl'] },
    '../lib/i18n': { t: (_lang, _key, fallback) => fallback },
  };
  function load(name) {
    const exports = {};
    const source = readFileSync(new URL(`../../src/scripts/${name}.ts`, import.meta.url), 'utf8');
    const script = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(script, { ...globals, exports, require: name => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    } });
    return exports;
  }
  imports['./content-popup'] = load('content-popup');
  load('footnote-popups').initFootnotePopups();
  return {
    document, navigation, scrolls, location,
    ref: document.getElementById('ref-note-1'),
    click: element => element.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })),
  };
}

test('down arrow closes the footnote popup before following its link', () => {
  const env = environment();
  env.click(env.ref);
  assert.equal(env.ref.getAttribute('aria-expanded'), 'true');
  const arrow = env.document.querySelector('.content-popup-action');
  assert.ok(arrow);
  env.click(arrow);
  assert.equal(env.document.querySelector('.content-popup'), null);
  assert.equal(env.ref.getAttribute('aria-expanded'), 'false');
  assert.equal(env.ref.hasAttribute('aria-controls'), false);
  assert.equal(env.ref.getAttribute('aria-describedby'), 'note-1');
  assert.equal(env.location.hash, '#listed-note-1');
  assert.equal(env.navigation.length, 1);
});

test('up arrow scrolls to the reference and reopens its pinned popup', () => {
  const env = environment();
  env.click(env.ref);
  env.click(env.document.querySelector('.content-popup-action'));
  const back = env.document.querySelector('.footnote-back');
  env.click(back);
  assert.equal(env.location.hash, '#ref-note-1');
  assert.equal(env.scrolls.at(-1).id, 'ref-note-1');
  assert.equal(env.scrolls.at(-1).options.behavior, 'instant');
  assert.equal(env.ref.getAttribute('aria-expanded'), 'true');
  const popup = env.document.querySelector('.content-popup');
  assert.ok(popup);
  assert.equal(popup.classList.contains('content-popup--preview'), false);
  assert.equal(popup.getAttribute('role'), 'dialog');
  assert.match(popup.textContent, /A useful footnote/);
  assert.equal(env.document.querySelectorAll('.content-popup').length, 1);
  // The return arrow also opens a popup without a preceding downward jump.
  env.click(back);
  assert.equal(env.document.querySelectorAll('.content-popup').length, 1);
});
