import { afterEach, describe, expect, it } from 'vitest';
import { createBoard, createGameState, type GameState, type Unit } from '../game';
import { setLocale } from './locale';
import { renderUnitBrief } from './unitBrief';

const unit = (patch: Partial<Unit> = {}): Unit => ({
  id: 'r1',
  kind: 'tank',
  owner: 'red',
  position: { x: 1, y: 0 },
  hp: 70,
  ammo: 3,
  fuel: 24,
  hasMoved: false,
  hasActed: false,
  ...patch,
});
const state = (units: Unit[]): GameState => ({ ...createGameState(createBoard(4, 3)), ruleVersion: 4, units });
const visible = new Set(['1,0', '2,0']);
const render = (units: Unit[], selected: string | undefined = 'r1', focused = { x: 2, y: 0 }) => {
  document.body.innerHTML = renderUnitBrief(state(units), 'red', visible, selected, focused);
  return document.querySelector<HTMLElement>('#unit-brief')!;
};

afterEach(() => {
  setLocale('ja');
  document.body.innerHTML = '';
});

describe('unit information beside the map', () => {
  it('keeps the selected unit while focus moves to a different destination or unit', () => {
    const brief = render([unit(), unit({ id: 'other', kind: 'infantry', position: { x: 2, y: 0 } })]);
    expect(brief.dataset.unitId).toBe('r1');
    expect(brief.textContent).toContain('戦車砲');
    expect(brief.textContent).toContain('70 / 100');
    expect(brief.textContent).toContain('3 / 6');
    expect(brief.textContent).toContain('24 / 70');
    expect(brief.textContent).toContain('未行動');
    expect(brief.textContent).toContain('(2, 1)');
  });

  it('shows the focused visible unit when there is no selection, including spectator and replay views', () => {
    expect(render([unit()], undefined, { x: 1, y: 0 }).dataset.unitId).toBe('r1');
    expect(render([unit()], 'removed', { x: 1, y: 0 }).dataset.unitId).toBe('r1');
  });

  it('gives a short prompt for empty, fogged, or embarked selections without exposing their details', () => {
    const cases = [[], [unit({ position: { x: 3, y: 2 } })], [unit({ position: undefined, embarkedIn: 'apc' })]];
    for (const units of cases) {
      const brief = render(units);
      expect(brief.classList.contains('unit-brief-empty')).toBe(true);
      expect(brief.dataset.unitId).toBeUndefined();
      expect(brief.textContent).not.toContain('戦車砲');
    }
  });

  it('hides enemy ammunition, fuel and action state even while its tile is visible', () => {
    const full = render([unit({ owner: 'blue', hp: 77, fuel: 67, ammo: 5 })]).outerHTML;
    const empty = render([unit({ owner: 'blue', hp: 77, fuel: 0, ammo: 0, hasMoved: true, hasActed: true })]).outerHTML;
    expect(empty).toBe(full);
    expect(document.body.textContent).toContain('敵軍 戦車');
    expect(document.body.textContent?.match(/非公開/g)).toHaveLength(2);
    expect(document.body.textContent).toContain('77 / 100');
    expect(document.body.textContent).not.toContain('弾切れ');
  });

  it('shows empty magazines, movement state, and safe full-magazine fallbacks', () => {
    expect(render([unit({ ammo: 0, hasMoved: true })]).textContent).toContain('弾切れ・補給が必要');
    expect(document.body.textContent).toContain('移動済み');
    expect(render([unit({ ammo: undefined, fuel: undefined, hasActed: true })]).textContent).toContain('6 / 6');
    expect(document.body.textContent).toContain('70 / 70');
    expect(document.body.textContent).toContain('行動済み');
  });

  it('describes unarmed transports and indirect ranges', () => {
    expect(render([unit({ kind: 'landingShip' })]).textContent).toContain('非武装');
    expect(document.body.textContent).not.toContain('弾切れ');
    expect(render([unit({ kind: 'artillery' })]).textContent).toContain('射程 2–3');
  });

  it('escapes IDs and provides English UI labels', () => {
    setLocale('en');
    const id = '"><img src=x>';
    const brief = render([unit({ id })], id);
    expect(brief.dataset.unitId).toBe(id);
    expect(document.querySelector('img')).toBeNull();
    expect(brief.textContent).toContain('Unit information');
    expect(brief.textContent).toContain('Tank cannon');
    expect(brief.textContent).toContain('Ready');
    expect(render([]).textContent).toContain('Select a unit');
  });
});
