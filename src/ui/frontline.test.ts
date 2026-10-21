import { afterEach, describe, expect, it } from 'vitest';
import { createBoard, createGameState, type GameState, type Unit } from '../game';
import { fortificationAt, renderFrontlineControls, supplyOutlook, supplyRange } from './frontline';
import { renderUnitBrief } from './unitBrief';
import { setLocale } from './locale';

const troop = (id: string, x: number, y: number, patch: Partial<Unit> = {}): Unit => ({
  id,
  kind: 'infantry',
  owner: 'red',
  position: { x, y },
  hp: 100,
  hasActed: false,
  hasMoved: false,
  ...patch,
});
function field(): GameState {
  const state: GameState = {
    ...createGameState(createBoard(6, 4)),
    ruleVersion: 8,
    units: [troop('e', 2, 1, { kind: 'engineer' })],
    players: { red: { gold: 1000, income: 0 }, blue: { gold: 0, income: 0 } },
  };
  state.board.terrain[1]![3] = { kind: 'supplyDepot', owner: 'red' };
  return state;
}
afterEach(() => setLocale('ja'));
describe('frontline controls and private supply information', () => {
  it('shows friendly supply sources and conditional outlook beside the selected unit', () => {
    const state = field();
    expect(supplyOutlook(state, state.units[0]!)).toContain('HP修理なし');
    const html = renderUnitBrief(state, 'red', new Set(['2,1']), 'e', { x: 2, y: 1 });
    expect(html).toContain('補給予定');
    expect(html).toContain('工兵');
    expect(supplyRange(state, 'red')).toContain('3,1');
    expect(supplyRange(state, 'red')).toContain('4,1');
    expect(supplyRange(state, 'red')).not.toContain('4,2');
    expect(supplyRange(state, 'blue')).toEqual(new Set());
    expect(supplyOutlook({ ...state, ruleVersion: 7 }, state.units[0]!)).toBe('');
    expect(supplyOutlook(state, { ...state.units[0]!, position: undefined })).toBe('');
    expect(renderUnitBrief(state, 'blue', new Set(['2,1']), 'e', { x: 2, y: 1 })).not.toContain('補給予定');
  });
  it('distinguishes a repair facility, mobile supply, absent supply and aviation', () => {
    const state = field();
    state.board.terrain[1]![2] = { kind: 'city', owner: 'red' };
    state.units.push(troop('a', 1, 1, { kind: 'apc' }));
    expect(supplyOutlook(state, state.units[0]!)).toContain('HP修理は有料');
    expect(supplyOutlook(state, state.units[0]!)).toContain('APC');
    expect(supplyOutlook(state, troop('i', 0, 3))).toContain('補給なし');
    expect(supplyRange(state, 'red', 'a')).toContain('2,1');
    state.units.push(troop('f', 3, 1, { kind: 'fighter' }));
    expect(supplyRange(state, 'red', 'f')).toEqual(new Set());
    state.board.terrain[0]![0] = { kind: 'airport', owner: 'red' };
    expect(supplyRange(state, 'red', 'f')).toEqual(new Set(['0,0']));
  });
  it('renders confirmation, cancellation, action errors and only friendly engineer controls', () => {
    const state = field();
    document.body.innerHTML = renderFrontlineControls(state, 'red', 'e', true, false);
    expect(document.querySelector('#fortify-unit')).not.toBeNull();
    expect(document.querySelector('#supply-range')?.getAttribute('aria-pressed')).toBe('false');
    document.body.innerHTML = renderFrontlineControls(state, 'red', 'e', true, true, 'e');
    expect(document.querySelector('#fortify-confirm')).not.toBeNull();
    expect(document.querySelector('#fortify-cancel')).not.toBeNull();
    state.players.red.gold = 0;
    document.body.innerHTML = renderFrontlineControls(state, 'red', 'e', true, true);
    expect((document.querySelector('#fortify-unit') as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('不足');
    expect(renderFrontlineControls(state, 'blue', 'e', false, false)).not.toContain('fortify-unit');
    expect(renderFrontlineControls({ ...state, ruleVersion: 7 }, 'red', 'e', true, false)).toBe('');
    document.body.innerHTML = renderFrontlineControls(field(), 'red', 'e', false, false);
    expect((document.querySelector('#fortify-unit') as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows fortifications only in actual vision, in either owner color', () => {
    const state = field();
    state.fortifications = [
      { owner: 'red', position: { x: 2, y: 1 } },
      { owner: 'blue', position: { x: 5, y: 3 } },
    ];
    expect(fortificationAt(state, { x: 2, y: 1 }, new Set(['2,1']))).toContain('red');
    expect(fortificationAt(state, { x: 5, y: 3 }, new Set())).toBe('');
    expect(fortificationAt(state, { x: 5, y: 3 }, new Set(['5,3']))).toContain('blue');
    expect(fortificationAt(state, { x: 3, y: 1 }, new Set(['3,1']))).toBe('');
    expect(fortificationAt(state, { x: 0, y: 0 }, new Set(['0,0']))).toBe('');
    expect(fortificationAt({ ...state, ruleVersion: 7 }, { x: 2, y: 1 }, new Set(['2,1']))).toBe('');
  });
  it('provides English labels and keeps unavailable sources out of the range', () => {
    const state = field();
    setLocale('en');
    expect(supplyOutlook(state, state.units[0]!)).toContain('supply depot');
    expect(supplyOutlook(state, troop('i', 0, 3))).toContain('No resupply');
    state.board.terrain[1]![2] = { kind: 'city', owner: 'red' };
    state.units.push(troop('a', 1, 1, { kind: 'apc' }));
    expect(supplyOutlook(state, state.units[0]!)).toContain('compatible facility');
    expect(supplyOutlook(state, state.units[0]!)).toContain('APC');
    expect(renderFrontlineControls(state, 'red', undefined, true, false)).toContain('Ground units');
    expect(renderFrontlineControls(field(), 'red', 'e', true, false)).toContain('Build cover');
    expect(renderFrontlineControls(field(), 'red', 'e', true, false, 'e')).toContain('Cancel');
  });
});
