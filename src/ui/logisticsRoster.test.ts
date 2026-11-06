import { expect, it } from 'vitest';
import { createBoard, createGameState } from '../game/state';
import { renderLogisticsRoster, bindLogisticsRoster } from './logisticsRoster';
import { setLocale } from './locale';
import type { GameCommand } from '../game/session';

it('opens lazily, filters all friendly units including cargo and dispatches explicit validated choices', () => {
  setLocale('en');
  const state = { ...createGameState(createBoard(5, 5)), ruleVersion: 14 as const };
  state.units = [
    { id: 'r1', kind: 'tank', owner: 'red', hp: 50, ammo: 0, fuel: 1, position: { x: 2, y: 2 }, hasMoved: true, hasActed: true },
    { id: 'r2', kind: 'infantry', owner: 'red', hp: 100, embarkedIn: 'r3', hasMoved: false, hasActed: false },
    { id: 'r3', kind: 'apc', owner: 'red', hp: 100, position: { x: 3, y: 2 }, hasMoved: false, hasActed: false },
    { id: 'b1', kind: 'tank', owner: 'blue', hp: 50, position: { x: 4, y: 4 }, hasMoved: false, hasActed: false },
  ];
  const root = document.createElement('div');
  const commands: GameCommand[] = [],
    selected: string[] = [];
  const render = () => {
    root.innerHTML = renderLogisticsRoster(state, 'red', true, 'r1');
    bindLogisticsRoster(
      root,
      render,
      (c) => commands.push(c),
      (id) => selected.push(id),
    );
  };
  render();
  expect(root.querySelectorAll('[data-logistics-row]')).toHaveLength(0);
  const details = root.querySelector('details')!;
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
  expect(root.querySelectorAll('[data-logistics-row]')).toHaveLength(3);
  expect(root.textContent).toContain('Embarked');
  expect(root.textContent).not.toContain('b1');
  expect(root.textContent).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
  const priority = root.querySelector<HTMLSelectElement>('[data-logistics-field="priority"]')!;
  priority.value = 'true';
  priority.dispatchEvent(new Event('change'));
  expect(commands[0]).toMatchObject({ type: 'logistics', unitId: 'r1', order: { priority: true, resource: 'ammo', repair: true } });
  const reserve = root.querySelector<HTMLInputElement>('#repair-reserve')!;
  reserve.value = '-1';
  reserve.dispatchEvent(new Event('change'));
  expect(commands).toHaveLength(1);
  reserve.value = '1000';
  reserve.dispatchEvent(new Event('change'));
  expect(commands[1]).toEqual({ type: 'repairReserve', amount: 1000 });
  const filter = root.querySelector<HTMLSelectElement>('#logistics-filter')!;
  filter.value = 'damaged';
  filter.dispatchEvent(new Event('change'));
  expect(root.querySelectorAll('li:not([hidden])')).toHaveLength(1);
  root.querySelector<HTMLButtonElement>('[data-logistics-select="r2"]')!.click();
  expect(selected).toEqual(['r2']);
  root.innerHTML = renderLogisticsRoster({ ...state, ruleVersion: 13 }, 'red', false);
  expect(root.querySelector('[data-logistics-field]')).toBeNull();
  expect(root.textContent).toContain('legacy');
  setLocale('ja');
});
