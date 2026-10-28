import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pairedCases, playLeg, returnLeg, runPairedBalance, summarizePairs } from './pairedBalance';
import * as cpu from '../src/ai/rules';
const args = ['--seas', 'none', '--seeds', 'smoke', '--variants', 'seeded', '--rounds', '1', '--max-games', '2'];
afterEach(() => vi.restoreAllMocks());
describe('paired CPU evaluation', () => {
  it('bounds both legs, validates policies, swaps settings and rotates layout reversibly', () => {
    const { cases } = pairedCases([...args, '--matchups', 'hard:normal', '--policies', 'offensive:defensive']);
    expect(cases).toHaveLength(1);
    expect(returnLeg(cases[0]!)).toMatchObject({ red: 'normal', blue: 'hard', redPolicy: 'defensive', bluePolicy: 'offensive', orientation: 'rotated' });
    expect(returnLeg(returnLeg(cases[0]!))).toEqual(cases[0]);
    for (const extra of [
      ['--policies', 'bad:balanced'],
      ['--policies', 'balanced'],
      ['--policies', 'balanced:balanced,balanced:balanced'],
      ['--policies'],
      ['--policies', 'balanced:balanced', '--policies', 'balanced:balanced'],
    ])
      expect(() => pairedCases([...args, ...extra])).toThrow();
    expect(() => pairedCases([...args, '--policies', 'balanced:balanced,offensive:defensive'])).toThrow('max-games');
  });
  it('records reproducible legal command streams without treating round limits as draws', () => {
    const config = pairedCases(args).cases[0]!;
    const a = playLeg(config, 1),
      b = playLeg(config, 1);
    expect(a.commandDigest).toEqual(b.commandDigest);
    expect(a.commands).toBeGreaterThan(0);
    expect(a.reason).toBe('round-limit');
    expect(a.cpuTiming.samples).toBe(a.commands);
    expect(summarizePairs([{ config, legs: [a, b] }])[0]).toMatchObject({ games: 2, firstWins: 0, secondWins: 0, undecided: 2, incompletePairs: 1, split: 0 });
    expect(
      summarizePairs([
        {
          config,
          legs: [
            { ...a, winner: 'red' },
            { ...b, winner: 'red' },
          ],
        },
      ])[0],
    ).toMatchObject({ bothFirst: 1, firstWins: 2 });
    expect(
      summarizePairs([
        {
          config,
          legs: [
            { ...a, winner: 'red' },
            { ...b, winner: 'blue' },
          ],
        },
      ])[0],
    ).toMatchObject({ split: 1 });
  });
  it('passes each side policy and requested rule through the real command boundary', () => {
    const config = pairedCases([...args, '--policies', 'offensive:defensive']).cases[0]!;
    const action = vi.spyOn(cpu, 'chooseCpuAction').mockReturnValue({ type: 'endTurn' });
    playLeg(config, 1, Infinity, () => 0, 9);
    expect(action.mock.calls.map((call) => [call[0].ruleVersion, call[2], call[3]])).toEqual([
      [9, 'red', 'offensive'],
      [9, 'blue', 'defensive'],
    ]);
    expect(() => playLeg(config, 1, 0, () => 0)).toThrow('time budget');
    action.mockReturnValue({ type: 'wait', unitId: 'missing' });
    expect(() => playLeg(config, 1)).toThrow('Illegal CPU command');
  });
  it('writes provenance, both legs, completion and explicit failure records', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ministr-paired-')),
      output = join(directory, 'report.jsonl');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const read = () =>
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map((row) => JSON.parse(row));
    try {
      runPairedBalance([...args, '--output', output]);
      const rows = read();
      expect(rows[0]).toMatchObject({ kind: 'paired-balance', sourceState: 'working-tree', requestedGames: 2 });
      expect(rows[0].simulationDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(rows[1]).toMatchObject({ pair: 0, leg: 0 });
      expect(rows[2]).toMatchObject({ pair: 0, leg: 1 });
      expect(rows.at(-1).complete).toBe(true);
      vi.spyOn(cpu, 'chooseCpuAction').mockReturnValue({ type: 'wait', unitId: 'missing' });
      expect(() => runPairedBalance([...args, '--output', output])).toThrow();
      expect(read().at(-1)).toMatchObject({ complete: false, completePairs: 0 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
