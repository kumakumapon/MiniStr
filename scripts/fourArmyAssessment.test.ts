import { describe, it, expect } from 'vitest';
import { fourArmyAssessmentCases, summarizeFourArmyAssessment } from './fourArmyAssessment';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import { isFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
describe('fixed four-army assessment protocol', () => {
  it('covers 24 distinct orders at each of three predetermined seeds and rotates mixed settings', () => {
    const cases = fourArmyAssessmentCases();
    expect(cases).toHaveLength(88);
    expect(new Set(cases.map((c) => c.id)).size).toBe(88);
    for (const seed of [15141, 15142, 15143]) {
      const rows = cases.filter((c) => c.group === 'orders' && c.seed === seed);
      expect(new Set(rows.map((c) => c.order.join())).size).toBe(24);
      for (const a of FOUR_ARMY_IDS) for (let seat = 0; seat < 4; seat++) expect(rows.filter((r) => r.order[seat] === a)).toHaveLength(6);
    }
    expect(cases.every((c) => isFourArmyCpuSettings(c.settings))).toBe(true);
    expect(cases.filter((c) => c.maxRound === 1000)).toHaveLength(4);
  });
  it('does not turn censored games into draws, or pool mixed settings into order fairness', () => {
    const rows = [
      { id: 'one', group: 'orders' as const, order: [...FOUR_ARMY_IDS], outcome: { type: 'victory', winner: 'army2' as const } },
      { id: 'two', group: 'orders' as const, order: [...FOUR_ARMY_IDS], outcome: { type: 'ongoing' } },
    ];
    const s = summarizeFourArmyAssessment(rows);
    expect(s[0]).toMatchObject({ cases: 2, victories: 1, draws: 0, ongoing: 1, verdict: 'censored-outcomes' });
    expect(s[0]!.armies[1]).toMatchObject({ wins: 1, possibleFractionWithCensored: [0.5, 1] });
    expect(s[0]!.seats[1]!.wins).toBe(1);
    expect(s[1]!.verdict).toBe('not-measured');
  });
});
