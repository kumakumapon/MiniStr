import { afterEach, expect, it } from 'vitest';
import { createBoard, createGameState, type GameState, type Unit } from '../game';
import { renderUnitBrief } from './unitBrief';
import { inspectTile } from './tileInspector';
import { supplyOutlook, supplyRange } from './frontline';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));
const truck = (id: string, x: number, owner: 'red' | 'blue', supplyStock: number): Unit => ({
  id,
  kind: 'apc',
  owner,
  position: { x, y: 1 },
  hp: 100,
  hasMoved: false,
  hasActed: false,
  supplyStock,
});
const state = (): GameState => ({ ...createGameState(createBoard(7, 3)), ruleVersion: 10, units: [truck('own', 1, 'red', 0), truck('enemy', 4, 'blue', 123)] });

it.each(['ja', 'en'] as const)('shows own stock and keeps enemy stock private in %s', (locale) => {
  setLocale(locale);
  const game = state();
  const visible = new Set(['1,1', '4,1']);
  const own = renderUnitBrief(game, 'red', visible, 'own', { x: 1, y: 1 });
  expect(own).toContain('0 / 300');
  expect(own).toContain(locale === 'en' ? 'Supply stock' : '補給物資');
  const enemy = renderUnitBrief(game, 'red', visible, 'enemy', { x: 4, y: 1 });
  expect(enemy).not.toContain('123');
  expect(enemy).toContain(locale === 'en' ? 'Hidden' : '非公開');
  expect(
    inspectTile(game, { x: 4, y: 1 }, 'red', visible)
      ?.unit?.rows.map((row) => row.value)
      .join(' '),
  ).not.toContain('123');
  expect(renderUnitBrief({ ...game, ruleVersion: 9 }, 'red', visible, 'own', { x: 1, y: 1 })).not.toContain(locale === 'en' ? 'Supply stock' : '補給物資');
});

it('does not advertise empty APC coverage and explains how to replenish stock', () => {
  const game = state();
  expect(supplyRange(game, 'red').size).toBe(0);
  expect(supplyOutlook(game, game.units[0]!)).toContain('物資 0 / 300');
  expect(supplyOutlook(game, game.units[0]!)).toContain('補給所で補充');
  game.units[0]!.supplyStock = 50;
  expect(supplyRange(game, 'red').has('2,1')).toBe(true);
  const rifle: Unit = { id: 'rifle', kind: 'infantry', owner: 'red', position: { x: 2, y: 1 }, hp: 100, ammo: 0, hasMoved: false, hasActed: false };
  game.units.push(rifle);
  expect(supplyOutlook(game, rifle)).toContain('物資の範囲');
  setLocale('en');
  expect(supplyOutlook(game, rifle)).toContain('partial');
});
