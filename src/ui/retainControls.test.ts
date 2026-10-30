import { expect, it } from 'vitest';
import { retainControls } from './retainControls';
it('preserves pointer targets and handlers while refreshing labels and state', () => {
  const root = document.createElement('div');
  root.innerHTML = '<button id="pause" disabled aria-pressed="false">Pause</button>';
  const button = root.querySelector<HTMLButtonElement>('#pause')!;
  let clicks = 0;
  button.onclick = () => {
    clicks++;
  };
  const restore = retainControls(root, ['#pause', '#absent']);
  root.innerHTML = '<button id="pause" aria-pressed="true">Resume</button>';
  restore();
  expect(root.querySelector('#pause')).toBe(button);
  expect(button.disabled).toBe(false);
  expect(button.textContent).toBe('Resume');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  button.click();
  expect(clicks).toBe(1);
  const removed = retainControls(root, ['#pause']);
  root.innerHTML = '<p>No spectator controls</p>';
  removed();
  expect(root.querySelector('#pause')).toBeNull();
});
