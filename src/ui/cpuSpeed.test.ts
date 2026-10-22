import { afterEach, expect, it } from 'vitest';
import { COMMAND_SPEEDS } from './commandScheduler';
import { renderCpuSpeedControl } from './cpuSpeed';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));

it('renders identical choices and the selected speed on the title and battlefield', () => {
  for (const speed of COMMAND_SPEEDS) {
    for (const id of ['cpu-speed', 'title-cpu-speed'] as const) {
      document.body.innerHTML = renderCpuSpeedControl(speed, id);
      const select = document.querySelector('select')!;
      expect(select.id).toBe(id);
      expect(select.value).toBe(String(speed));
      expect([...select.options].map((option) => Number(option.value))).toEqual(COMMAND_SPEEDS);
      expect(select.disabled).toBe(false);
    }
  }
});

it('keeps replay controls disabled and supplies English labels', () => {
  setLocale('en');
  document.body.innerHTML = renderCpuSpeedControl(2, 'cpu-speed', true);
  expect(document.body.textContent).toContain('CPU speed');
  expect(document.querySelector('select')!.getAttribute('aria-label')).toBe('CPU action speed');
  expect(document.querySelector('select')!.disabled).toBe(true);
});
