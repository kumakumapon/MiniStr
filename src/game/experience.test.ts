import { describe, expect, it } from 'vitest';
import { inspectTile } from '../ui/tileInspector';
import {
  attackUnit, createBoard, createGameState, experienceRank, forecastCombat, isGameState, MAX_EXPERIENCE, mergeUnits,
  MODERN_RULE_VERSION, type GameState, type Unit,
} from './index';

const unit = (patch: Partial<Unit> & Pick<Unit, 'id' | 'kind' | 'owner'>): Unit => ({
  position: { x: 0, y: 0 }, hp: 100, hasMoved: false, hasActed: false, ...patch,
});

function duel(attacker: Partial<Unit>, defender: Partial<Unit>, modern = true): GameState {
  return {
    ...createGameState(createBoard(3, 1)),
    ...(modern ? { ruleVersion: MODERN_RULE_VERSION } : {}),
    units: [
      unit({ id: 'a', kind: 'tank', owner: 'red', position: { x: 0, y: 0 }, ...attacker }),
      unit({ id: 'd', kind: 'tank', owner: 'blue', position: { x: 1, y: 0 }, ...defender }),
    ],
  };
}

const forecast = (state: GameState) => {
  const result = forecastCombat(state, state.units[0]!, state.units[1]!);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe('experience ranks', () => {
  it('promotes at 3, 6, and 10 experience', () => {
    expect([0, 2, 3, 5, 6, 9, 10].map(value => experienceRank(value))).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(experienceRank(undefined)).toBe(0);
  });

  it('gives ranked attackers more damage and ranked defenders less under modern rules', () => {
    const base = forecast(duel({}, {}));
    const veteranAttacker = forecast(duel({ experience: 10 }, {}));
    const veteranDefender = forecast(duel({}, { experience: 10 }));
    expect(veteranAttacker.damageToDefender).toBeGreaterThan(base.damageToDefender);
    expect(veteranDefender.damageToDefender).toBeLessThan(base.damageToDefender);
    // A rank-3 defender also counterattacks harder.
    expect(veteranDefender.damageToAttacker).toBeGreaterThan(base.damageToAttacker);
  });

  it('leaves unranked modern combat identical to classic combat', () => {
    expect(forecast(duel({}, {}))).toEqual(forecast(duel({}, {}, false)));
    expect(forecast(duel({ experience: 2 }, { experience: 2 }))).toEqual(forecast(duel({}, {}, false)));
  });
});

describe('earning experience', () => {
  it('rewards both sides for damage dealt under modern rules', () => {
    const result = attackUnit(duel({}, {}), 'a', 'd');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.units.find(candidate => candidate.id === 'a')?.experience).toBe(1);
    expect(result.value.units.find(candidate => candidate.id === 'd')?.experience).toBe(1);
  });

  it('adds a bonus for destroying the target and caps experience', () => {
    const result = attackUnit(duel({ experience: MAX_EXPERIENCE - 1 }, { hp: 5 }), 'a', 'd');
    expect(result.ok && result.value.units.map(candidate => candidate.experience)).toEqual([MAX_EXPERIENCE]);

    const fresh = attackUnit(duel({}, { hp: 5 }), 'a', 'd');
    expect(fresh.ok && fresh.value.units[0]!.experience).toBe(2);
  });

  it('does not track experience under classic rules', () => {
    const result = attackUnit(duel({}, {}, false), 'a', 'd');
    expect(result.ok && result.value.units.every(candidate => candidate.experience === undefined)).toBe(true);
  });

  it('keeps the higher experience when units merge', () => {
    const state: GameState = {
      ...duel({}, {}),
      units: [
        unit({ id: 'strong', kind: 'tank', owner: 'red', hp: 70, experience: 1 }),
        unit({ id: 'veteran', kind: 'tank', owner: 'red', hp: 20, experience: 7, position: { x: 1, y: 0 } }),
      ],
    };
    const merged = mergeUnits(state, 'strong', 'veteran');
    expect(merged.ok && merged.value.units).toEqual([expect.objectContaining({ id: 'strong', hp: 90, experience: 7 })]);
  });
});

describe('experience validation and display', () => {
  it('accepts integral experience within range only on modern states', () => {
    const withExperience = (experience: number, modern = true) => {
      const state = duel({ experience }, {}, modern);
      return isGameState(state);
    };
    expect(withExperience(4)).toBe(true);
    expect(withExperience(MAX_EXPERIENCE + 1)).toBe(false);
    expect(withExperience(-1)).toBe(false);
    expect(withExperience(1.5)).toBe(false);
    expect(withExperience(4, false)).toBe(false);
  });

  it('shows rank and experience in the tile inspector for modern matches', () => {
    const visible = new Set(['0,0', '1,0']);
    const modern = inspectTile(duel({ experience: 6 }, {}), { x: 0, y: 0 }, 'red', visible);
    expect(modern?.unit?.rows).toContainEqual({ label: '階級', value: '★★ 精鋭（経験 6 / 10）' });
    const classic = inspectTile(duel({}, {}, false), { x: 0, y: 0 }, 'red', visible);
    expect(classic?.unit?.rows.some(row => row.label === '階級')).toBe(false);
  });
});
