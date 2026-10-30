// Client-side self-check interactions for Question components.
export function initQuestion(): void {
  for (const form of document.querySelectorAll<HTMLFormElement>('[data-question]')) {
    const feedback = form.querySelector('[data-feedback]');
    if (!feedback || form.dataset.wired) continue;
    form.dataset.wired = 'true';

    form.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== 'checkbox') return;
      if (form.dataset.single === 'true' && target.checked) {
        for (const input of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
          if (input !== target) {
            input.checked = false;
            const otherLabel = input.closest('label');
            if (otherLabel) delete otherLabel.dataset.mark;
          }
        }
      }
      const label = target.closest('label');
      if (label) delete label.dataset.mark;
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const inputs = [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')];
      const checked = inputs.filter((input) => input.checked);
      const single = form.dataset.single === 'true';
      let state: 'correct' | 'incorrect' | 'unfinished' | 'empty';
      if (checked.length === 0) {
        state = 'empty';
      } else if (single) {
        state = checked.length === 1 && checked[0]?.hasAttribute('data-correct') ? 'correct' : 'incorrect';
      } else {
        const wanted = inputs.filter((input) => input.hasAttribute('data-correct'));
        state =
          checked.length === wanted.length && checked.every((input) => input.hasAttribute('data-correct'))
            ? 'correct'
            : checked.some((input) => !input.hasAttribute('data-correct'))
              ? 'incorrect'
              : 'unfinished';
      }
      const key =
        state === 'empty' ? 'feedbackEmpty' :
        state === 'correct' ? 'feedbackCorrect' : state === 'incorrect' ? 'feedbackIncorrect' : 'feedbackUnfinished';
      feedback.setAttribute('role', state === 'empty' ? 'alert' : 'status');
      feedback.setAttribute('aria-live', state === 'empty' ? 'assertive' : 'polite');
      feedback.textContent = form.dataset[key] ?? '';
      feedback.setAttribute('data-state', state);
      markOptions(form, inputs);
    });
  }
}

/** Mark selected options inside their pebble checkbox: correctly selected
 *  options replace the selection x with a green checkmark, wrongly selected
 *  ones with a red x. Unselected options stay unmarked, so an unselected
 *  correct answer is never spoiled. */
function markOptions(form: HTMLFormElement, inputs: HTMLInputElement[]): void {
  for (const input of inputs) {
    const label = input.closest('label');
    if (!label) continue;
    if (!input.checked) {
      delete label.dataset.mark;
      continue;
    }
    const isCorrect = input.hasAttribute('data-correct');
    label.dataset.mark = isCorrect ? 'correct' : 'incorrect';
  }
}
