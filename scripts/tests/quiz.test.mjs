import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initQuiz } from '../../src/scripts/quiz.ts';

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
afterEach(() => {
  if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
  else delete globalThis.document;
});

function environment(single = false) {
  const attributes = new Map();
  const feedback = { textContent: '', setAttribute: (key, value) => attributes.set(key, value) };
  const inputs = [true, !single, false].map(correct => ({
    checked: false,
    hasAttribute: () => correct,
    closest: () => null,
  }));
  const events = new Map();
  const form = {
    dataset: { single: String(single), feedbackEmpty: 'Please select at least one answer.',
      feedbackCorrect: 'Correct!', feedbackIncorrect: 'Incorrect', feedbackUnfinished: 'Almost' },
    querySelector: selector => selector === '[data-feedback]' ? feedback : null,
    querySelectorAll: () => inputs,
    addEventListener: (name, listener) => events.set(name, listener),
  };
  Object.defineProperty(globalThis, 'document', {
    value: { querySelectorAll: () => [form] }, configurable: true,
  });
  initQuiz();
  return { inputs, feedback, attributes, submit: () => events.get('submit')({ preventDefault() {} }) };
}

for (const single of [false, true]) {
  test(`${single ? 'radio' : 'checkbox'}: empty submit shows an error, then allows correction`, () => {
    const env = environment(single);
    assert.equal(env.feedback.textContent, '');
    env.submit();
    assert.equal(env.feedback.textContent, 'Please select at least one answer.');
    assert.equal(env.attributes.get('data-state'), 'empty');
    assert.equal(env.attributes.get('role'), 'alert');
    assert.equal(env.attributes.get('aria-live'), 'assertive');
    for (const input of env.inputs) input.checked = input.hasAttribute('data-correct');
    env.submit();
    assert.equal(env.feedback.textContent, 'Correct!');
    assert.equal(env.attributes.get('data-state'), 'correct');
    assert.equal(env.attributes.get('aria-live'), 'polite');
    for (const input of env.inputs) input.checked = false;
    env.submit();
    assert.equal(env.attributes.get('data-state'), 'empty');
  });
}

test('partially correct and incorrect selections retain their existing feedback', () => {
  const env = environment();
  env.inputs[0].checked = true;
  env.submit();
  assert.equal(env.attributes.get('data-state'), 'unfinished');
  env.inputs[2].checked = true;
  env.submit();
  assert.equal(env.attributes.get('data-state'), 'incorrect');
});
