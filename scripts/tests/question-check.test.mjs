import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initQuestion } from '../../src/scripts/question-check.ts';

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
afterEach(() => {
  if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
  else delete globalThis.document;
});

function environment(single = false) {
  const attributes = new Map();
  const feedback = { textContent: '', setAttribute: (key, value) => attributes.set(key, value) };
  const labels = [true, !single, false].map(() => ({ dataset: {} }));
  const inputs = [true, !single, false].map((correct, i) => ({
    type: 'checkbox',
    checked: false,
    hasAttribute: () => correct,
    closest: (selector) => selector === 'label' ? labels[i] : null,
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
  initQuestion();
  return {
    inputs,
    labels,
    feedback,
    attributes,
    submit: () => events.get('submit')({ preventDefault() {} }),
    change: target => events.get('change')?.({ target }),
  };
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
    assert.equal(env.feedback.textContent, 'Please select at least one answer.');
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

test('single-choice with checkboxes unchecks previously selected option on change', () => {
  const env = environment(true);
  env.inputs[0].checked = true;
  env.change(env.inputs[0]);
  assert.equal(env.inputs[0].checked, true);
  assert.equal(env.inputs[1].checked, false);

  env.inputs[1].checked = true;
  env.change(env.inputs[1]);
  assert.equal(env.inputs[0].checked, false);
  assert.equal(env.inputs[1].checked, true);
});

test('checking replaces selection marks with correct/incorrect on selected options and clears on change', () => {
  const env = environment(false);
  env.inputs[0].checked = true; // correct
  env.inputs[2].checked = true; // incorrect
  env.submit();
  assert.equal(env.labels[0].dataset.mark, 'correct');
  assert.equal(env.labels[1].dataset.mark, undefined); // unselected stays unmarked
  assert.equal(env.labels[2].dataset.mark, 'incorrect');

  env.change(env.inputs[0]);
  assert.equal(env.labels[0].dataset.mark, undefined);
});
