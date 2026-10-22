import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparisonScenario, generatedCases, openingDistance, parseGeneratedBalanceArgs, playGenerated, runGeneratedComparison, summarizeGenerated } from './generatedBalance';
import { createScenarioInitialState } from '../src/game/maps';
import { inspectGeneratedMap } from '../src/game/mapGenerator';
import * as cpu from '../src/ai/rules';

afterEach(() => vi.restoreAllMocks());
describe('bounded reproducible generated comparisons', () => {
  it('parses separate generation and combat seeds, rule versions, orientations, and bounded matrices', () => {
    const defaults = parseGeneratedBalanceArgs([]);
    expect(defaults.damageSeeds).toEqual(['scenario']);
    expect(generatedCases(defaults)).toHaveLength(9);
    const options = parseGeneratedBalanceArgs([
      '--sizes',
      '20,24',
      '--seas',
      'coast',
      '--seeds',
      'a,b',
      '--damage-seeds',
      '0,7919',
      '--orientations',
      'normal,rotated',
      '--matchups',
      'hard:normal,normal:hard',
      '--variants',
      'baseline,seeded',
      '--bonuses',
      '1000',
      '--rule',
      '6',
      '--rounds',
      '12',
      '--seconds',
      '30',
      '--max-games',
      '100',
      '--output',
      'file',
    ]);
    expect(generatedCases(options)).toHaveLength(64);
    for (const args of [
      ['--no', '1'],
      ['--rounds'],
      ['--rounds', '2', '--rounds', '3'],
      ['--seeds', 'a,a'],
      ['--seeds', ''],
      ['--seeds', 'bad/seed'],
      ['--sizes', '32'],
      ['--seas', 'unknown'],
      ['--damage-seeds', '-1'],
      ['--orientations', 'sideways'],
      ['--matchups', 'hard:bad'],
      ['--variants', 'bad'],
      ['--bonuses', '0.5'],
      ['--rounds', '0'],
      ['--seconds', '0'],
      ['--rule', '5'],
      ['--max-games', '1'],
    ])
      expect(() => parseGeneratedBalanceArgs(args)).toThrow();
  });
  it('keeps the baseline, seeded battle streams, rotation and the rejected wide-lane trial reproducible', () => {
    const config = generatedCases(parseGeneratedBalanceArgs(['--seas', 'ocean', '--seeds', 'repeat']))[0]!;
    const base = comparisonScenario(config),
      rotated = comparisonScenario({ ...config, orientation: 'rotated' });
    expect(inspectGeneratedMap(base)).toEqual([]);
    expect(rotated.board.terrain[0]![0]).toEqual(base.board.terrain.at(-1)!.at(-1));
    expect(openingDistance(base, 'red')).toBe(openingDistance(base, 'blue'));
    expect(openingDistance({ ...base, initialUnits: [] }, 'red')).toBeNull();
    expect(comparisonScenario({ ...config, variant: 'wide' }).board).not.toEqual(base.board);
    expect(createScenarioInitialState(base).rngSeed).toBe(1);
    expect(createScenarioInitialState(comparisonScenario({ ...config, variant: 'seeded' })).rngSeed).not.toBe(1);
  });
  it('compares the frontline preset with the same seeded damage stream and rotated layout', () => {
    const options = parseGeneratedBalanceArgs(['--seas', 'coast', '--seeds', 'frontline-check', '--variants', 'seeded,frontline', '--rule', '9']);
    const cases = generatedCases(options);
    const base = comparisonScenario(cases[0]!);
    const config = cases.find((item) => item.variant === 'frontline')!;
    const frontline = comparisonScenario(config);
    expect(frontline.id).toContain('generated-v3-frontline-');
    expect(frontline.battleSeed).toBe(base.battleSeed);
    expect(inspectGeneratedMap(frontline)).toEqual([]);
    expect(frontline.initialUnits.filter((unit) => unit.kind === 'engineer')).toHaveLength(2);
    expect(frontline.board.terrain.flat().filter((tile) => tile.kind === 'supplyDepot')).toHaveLength(2);
    const rotated = comparisonScenario({ ...config, orientation: 'rotated' });
    expect(rotated.board.terrain[0]![0]).toEqual(frontline.board.terrain.at(-1)!.at(-1));
  });
  it('executes legal bounded matches, records partial timeouts and leaves comparable JSONL rows', () => {
    const options = parseGeneratedBalanceArgs(['--seas', 'none', '--seeds', 'smoke', '--rounds', '1']);
    const config = generatedCases(options)[0]!;
    const first = playGenerated(config, options),
      second = playGenerated(config, options);
    expect(first.commands).toBeGreaterThan(0);
    expect({ ...first, elapsedMs: 0 }).toEqual({ ...second, elapsedMs: 0 });
    expect(summarizeGenerated([first, second])[0]).toMatchObject({ games: 2, undecided: 2 });
    expect(() => playGenerated(config, options, 0, () => 0)).toThrow('time budget');
    vi.spyOn(cpu, 'chooseCpuAction').mockReturnValue({ type: 'wait', unitId: 'missing' });
    expect(() => playGenerated(config, options)).toThrow('Illegal CPU order');
    vi.restoreAllMocks();
    const directory = mkdtempSync(join(tmpdir(), 'ministr-generated-'));
    const output = join(directory, 'report.jsonl');
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runGeneratedComparison(['--seas', 'none', '--seeds', 'smoke', '--rounds', '1', '--output', output]);
      const rows = readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows[0]).toMatchObject({ kind: 'generated-balance', sourceState: 'working-tree' });
      expect(rows[0].sourceDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(rows[1].result).toMatchObject({ seed: 'smoke', damageSeed: 'scenario', resolvedDamageSeed: 1, winner: 'none' });
      expect(rows.at(-1).complete).toBe(true);
      vi.spyOn(cpu, 'chooseCpuAction').mockReturnValue({ type: 'wait', unitId: 'missing' });
      expect(() => runGeneratedComparison(['--seas', 'none', '--seeds', 'smoke', '--rounds', '1', '--output', output])).toThrow();
      expect(JSON.parse(readFileSync(output, 'utf8').trim().split('\n').at(-1)!).complete).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
