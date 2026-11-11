import { expect, it } from 'vitest';
import { createBoard, createGameState } from '../game/state';
import { renderLogisticsRoster, bindLogisticsRoster } from './logisticsRoster';
import { setLocale } from './locale';
import type { GameCommand } from '../game/session';
import { applyGameCommand } from '../game/session';
import { valueOf } from '../game/operations.fixture';
import { updateScreen } from './screenView';
import type { GameState, PlayerId } from '../game/types';

it('opens lazily, filters all friendly units including cargo and dispatches explicit validated choices', () => {
  setLocale('en');
  const state = { ...createGameState(createBoard(5, 5)), ruleVersion: 14 as const };
  state.units = [
    { id: 'r1', kind: 'tank', owner: 'red', hp: 50, ammo: 0, fuel: 1, position: { x: 2, y: 2 }, hasMoved: true, hasActed: true },
    { id: 'r2', kind: 'infantry', owner: 'red', hp: 100, embarkedIn: 'r3', hasMoved: false, hasActed: false },
    { id: 'r3', kind: 'apc', owner: 'red', hp: 100, position: { x: 3, y: 2 }, hasMoved: false, hasActed: false },
    { id: 'b1', kind: 'tank', owner: 'blue', hp: 50, position: { x: 4, y: 4 }, hasMoved: false, hasActed: false },
  ];
  state.board.terrain[2]![2] = { kind: 'city', owner: 'red' };
  state.players.red.income = 0; // Cached income predates the newly captured city.
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
  expect(root.querySelector('[data-logistics-row]')!.textContent).toContain('HP 60');
  expect(state.units[0]!.hp).toBe(50);
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
  filter.value = 'supply';
  filter.dispatchEvent(new Event('change'));
  expect(root.querySelectorAll('li:not([hidden])')).toHaveLength(1);
  expect(root.querySelector('li:not([hidden]) [data-logistics-select]')!.getAttribute('data-logistics-select')).toBe('r1');
  root.querySelector<HTMLButtonElement>('[data-logistics-select="r2"]')!.click();
  expect(selected).toEqual(['r2']);
  root.innerHTML = renderLogisticsRoster({ ...state, ruleVersion: 13 }, 'red', false);
  expect(root.querySelector('[data-logistics-field]')).toBeNull();
  expect(root.textContent).toContain('legacy');
  setLocale('ja');
});

it('retains selection-only rows, refreshes orders/locale/permissions/viewer and binds commands once', () => {
  setLocale('en');
  let state: GameState = { ...createGameState(createBoard(10, 10)), ruleVersion: 14 };
  state.units = [
    { id: 'r1', kind: 'tank', owner: 'red', hp: 50, ammo: 0, fuel: 1, position: { x: 1, y: 1 }, hasMoved: false, hasActed: false },
    { id: 'r2', kind: 'infantry', owner: 'red', hp: 100, position: { x: 2, y: 1 }, hasMoved: false, hasActed: false },
    { id: 'b1', kind: 'tank', owner: 'blue', hp: 100, position: { x: 9, y: 9 }, hasMoved: false, hasActed: false },
  ];
  state.board.terrain[1]![1] = { kind: 'city', owner: 'red' };
  state.players.red = { gold: 5000, income: 0 };
  let selected: string | undefined = 'r1',
    player: PlayerId = 'red',
    canAct = true,
    dispatched = 0;
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const render = () => {
    const roster = renderLogisticsRoster(state, player, canAct, selected);
    updateScreen(
      root,
      '<main class="game-shell"><section class="battle-layout"><div class="battlefield-wrap"><div class="battlefield-stage"><div id="board-viewport"><div class="board"></div></div></div></div><aside id="command-panel">' +
        roster +
        '</aside></section></main>',
      true,
    );
    bindLogisticsRoster(
      root,
      render,
      (command) => {
        dispatched++;
        state = valueOf(applyGameCommand(state, command));
        render();
      },
      (id) => {
        selected = id;
        render();
      },
    );
  };
  render();
  const details = root.querySelector('details')!;
  if (!details.open) {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  }
  const filter = root.querySelector<HTMLSelectElement>('#logistics-filter')!;
  filter.value = 'all';
  filter.dispatchEvent(new Event('change'));
  render();
  const list = root.querySelector('#logistics-list')!;
  expect(root.querySelector('[data-logistics-unit="r1"]')!.textContent).toContain('HP 70');
  for (let i = 0; i < 5; i++) root.querySelector<HTMLButtonElement>('[data-logistics-select="r2"]')!.click();
  expect(root.querySelector('#logistics-list')).toBe(list);
  expect(root.querySelector('[data-logistics-unit="r2"]')!.getAttribute('data-selected')).toBe('true');
  selected = undefined;
  render();
  expect(root.querySelector('#logistics-list')).toBe(list);
  expect(root.querySelector('[data-logistics-row][data-selected="true"]')).toBeNull();
  const repair = root.querySelector<HTMLSelectElement>('[data-unit="r1"][data-logistics-field="repair"]')!;
  repair.value = 'false';
  repair.dispatchEvent(new Event('change'));
  expect(dispatched).toBe(1);
  expect(root.querySelector('#logistics-list')).not.toBe(list);
  expect(root.querySelector('[data-logistics-unit="r1"]')!.textContent).toContain('HP 50');
  setLocale('ja');
  render();
  expect(root.textContent).toContain('部隊・兵站一覧');
  canAct = false;
  render();
  expect([...root.querySelectorAll<HTMLSelectElement>('[data-logistics-field]')].every((field) => field.disabled)).toBe(true);
  player = 'blue';
  selected = 'b1';
  render();
  expect(root.querySelector('[data-logistics-select="b1"]')).not.toBeNull();
  expect(root.querySelector('[data-logistics-select="r1"]')).toBeNull();
  expect(state.units.find((unit) => unit.id === 'r1')!.hp).toBe(50);
});
