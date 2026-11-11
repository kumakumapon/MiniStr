import { afterEach, describe, expect, it } from 'vitest';
import { deploymentSlots } from '../game/deployment';
import { defaultDeploymentPlacements } from '../game/deploymentPositions';
import { maps } from '../game/maps';
import type { Position } from '../game/types';
import { renderDeployment } from './deployment';
import { setLocale } from './locale';

const canyon = maps.find((scenario) => scenario.id === 'canyon')!;
const choices = { red: deploymentSlots(canyon).map((slot) => slot.kind), blue: deploymentSlots(canyon, 'blue').map((slot) => slot.kind) };
afterEach(() => setLocale('ja'));

describe('starting-position briefing', () => {
  it.each(['ja', 'en'])('shows rotated areas, current coordinates and locked aircraft in %s', (locale) => {
    setLocale(locale);
    const placements = defaultDeploymentPlacements(canyon);
    placements.red[0] = { x: 3, y: 4 };
    document.body.innerHTML = renderDeployment(canyon, choices, ['red', 'blue'], true, '', undefined, { placements });
    expect(document.querySelectorAll('.deployment-position-grid li')).toHaveLength(32);
    expect(document.querySelectorAll('[data-position-player]')).toHaveLength(10);
    expect(document.querySelector<HTMLSelectElement>('#briefing-position-red-0')?.value).toBe('3,4');
    expect(document.querySelector<HTMLSelectElement>('#briefing-position-red-4')?.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#briefing-position-blue-4')?.disabled).toBe(true);
    expect(document.querySelector('#briefing-position-red-0')?.closest('.deployment-unit-slot')?.querySelector('.deployment-slot span')?.textContent).toContain('(4, 5)');
    expect(document.querySelectorAll('.deployment-position-grid')[0]?.textContent).toContain('r1');
    expect(document.querySelectorAll('.deployment-position-grid')[1]?.textContent).toContain('b5');
    expect(document.querySelector('.deployment-position-note')?.textContent).toContain(locale === 'en' ? 'types only' : '位置を保存せず');
    expect(document.querySelector('#briefing-position-red-0')?.getAttribute('aria-label')).toContain(locale === 'en' ? 'starting position' : '出撃位置');
  });

  it('keeps the ordinary deployment UI and hides the other army in CPU preparation', () => {
    document.body.innerHTML = renderDeployment(canyon, choices, ['red'], true, '');
    expect(document.querySelectorAll('[data-position-player]')).toHaveLength(0);
    expect(document.querySelectorAll('.deployment-unit-slot')).toHaveLength(0);
    document.body.innerHTML = renderDeployment(canyon, choices, ['red'], true, '', undefined, { placements: defaultDeploymentPlacements(canyon) });
    expect(document.querySelectorAll('[data-position-player="red"]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-position-player="blue"]')).toHaveLength(0);
    expect(document.querySelectorAll('.deployment-position-grid')).toHaveLength(1);
  });

  it('escapes malformed coordinate attributes before inserting briefing HTML', () => {
    const placements = defaultDeploymentPlacements(canyon);
    placements.red[4] = { x: '"><img src=x onerror=alert(1)>', y: '<script>alert(1)</script>' } as unknown as Position;
    document.body.innerHTML = renderDeployment(canyon, choices, ['red'], true, '', undefined, { placements });
    expect(document.querySelectorAll('img, script, [onerror]')).toHaveLength(0);
    const fixed = document.querySelector<HTMLSelectElement>('#briefing-position-red-4');
    expect(fixed?.disabled).toBe(true);
    expect(fixed?.selectedOptions[0]?.textContent).toBe('(NaN, NaN)');
    expect(fixed?.value).toBe(`${placements.red[4].x},${placements.red[4].y}`);
  });
});
