import { describe, expect, it } from 'vitest';
import { GENERATED_SEAS, GENERATED_SIZES, generateSymmetricMap, generateSymmetricMapV1, generatedBattleSeed, inspectGeneratedMap } from './mapGenerator';
import { createScenarioInitialState, loadScenarioDefinitions, scenarioDefinitionToData } from './maps';
import { parseSavedGame, saveGame } from './session';
import { valueOf } from './operations.fixture';

describe('symmetric map generation', () => {
  for (const size of GENERATED_SIZES)
    for (const sea of GENERATED_SEAS)
      it(`generates connected, symmetric ${size}/${sea} boards`, () => {
        for (const seed of ['MiniStr-1', 'different', '0', 'z_z-24']) {
          const scenario = valueOf(generateSymmetricMap({ size, sea, seed }));
          expect(inspectGeneratedMap(scenario)).toEqual([]);
          expect(scenario.board).toMatchObject({ width: size, height: size - 4 });
          expect(scenario.initialUnits.filter((unit) => unit.owner === 'red')).toHaveLength(sea === 'none' ? 7 : 8);
          expect(scenario.board.terrain.flat().some((tile) => tile.kind === 'sea')).toBe(sea !== 'none');
          expect(createScenarioInitialState(scenario).scenarioSnapshot).toEqual(scenarioDefinitionToData(scenario));
          expect(valueOf(generateSymmetricMap({ size, sea, seed }))).toEqual(scenario);
        }
      });

  it('varies terrain by seed and retains generated snapshots in portable saves', () => {
    const first = valueOf(generateSymmetricMap({ size: 20, sea: 'coast', seed: 'alpha' }));
    const second = valueOf(generateSymmetricMap({ size: 20, sea: 'coast', seed: 'beta' }));
    expect(first.board).not.toEqual(second.board);
    const initial = createScenarioInitialState(first);
    const saved = valueOf(
      saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'generated', {
        mapId: first.id,
        difficulty: 'normal',
        initialState: initial,
        gameState: initial,
        commands: [],
      }),
    );
    expect(valueOf(parseSavedGame(JSON.stringify(saved))).initialState.scenarioSnapshot).toEqual(scenarioDefinitionToData(first));
  });

  it.each([
    null,
    [],
    {},
    { size: 32, sea: 'none', seed: 'a' },
    { size: 16, sea: 'invalid', seed: 'a' },
    { size: 16, sea: 'none', seed: '' },
    { size: 16, sea: 'none', seed: '../unsafe' },
    { size: 16, sea: 'none', seed: 'x'.repeat(25) },
  ])('rejects unsupported generation options %j', (options) => {
    expect(generateSymmetricMap(options).ok).toBe(false);
  });

  it('reports asymmetric forces, terrain, isolated properties and disconnected ports', () => {
    const scenario = valueOf(generateSymmetricMap({ size: 16, sea: 'coast', seed: 'inspect' }));
    const broken = structuredClone(scenario);
    broken.initialUnits = broken.initialUnits.slice(1);
    broken.board.terrain[0]![0] = { kind: 'city' };
    broken.board.terrain[0]![5] = { kind: 'port' };
    broken.board.terrain[0]![4] = { kind: 'mountain' };
    broken.board.terrain[0]![6] = { kind: 'mountain' };
    broken.board.terrain[1]![5] = { kind: 'mountain' };
    expect(inspectGeneratedMap(broken)).toEqual(
      expect.arrayContaining(['地形または施設の所有が対称ではありません。', '初期兵力が対称ではありません。', '施設へ通じる陸路がありません。', '港を結ぶ航路がありません。']),
    );
    for (const row of broken.board.terrain) for (const tile of row) if (tile.kind === 'capital') tile.kind = 'plain';
    expect(inspectGeneratedMap(broken)).toContain('両軍の司令部が必要です。');
  });
});

describe('generated battle streams and old snapshots', () => {
  it('retains V1 definitions and independently reproduces V2 terrain and combat seeds', () => {
    const options = { size: 16 as const, sea: 'coast' as const, seed: 'legacy-stream' };
    const old = valueOf(generateSymmetricMapV1(options)),
      current = valueOf(generateSymmetricMap(options));
    expect(old.id).toContain('generated-v1-');
    expect(current.id).toContain('generated-v2-');
    expect(current.board).toEqual(old.board);
    expect(current.initialUnits).toEqual(old.initialUnits);
    expect(createScenarioInitialState(old).rngSeed).toBe(1);
    expect(createScenarioInitialState(current).rngSeed).toBe(generatedBattleSeed(options));
    expect(generatedBattleSeed({ ...options, seed: 'other-stream' })).not.toBe(current.battleSeed);
    const oldState = { ...createScenarioInitialState(old), ruleVersion: 6 as const };
    const saved = valueOf(
      saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'old-map', {
        mapId: old.id,
        difficulty: 'normal',
        initialState: oldState,
        gameState: oldState,
        commands: [],
      }),
    );
    expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState).toEqual(oldState);
  });
  it('validates and exports the full unsigned battle seed range', () => {
    const data = scenarioDefinitionToData(valueOf(generateSymmetricMap({ size: 16, sea: 'none', seed: 'range' })));
    for (const battleSeed of [-1, 0x1_0000_0000, 1.5, null, '1']) expect(loadScenarioDefinitions([{ ...data, battleSeed }]).ok).toBe(false);
    for (const battleSeed of [0, 0xffff_ffff]) {
      const scenario = valueOf(loadScenarioDefinitions([{ ...data, battleSeed }]))[0]!;
      expect(createScenarioInitialState(scenario).rngSeed).toBe(battleSeed);
      expect(scenarioDefinitionToData(scenario).battleSeed).toBe(battleSeed);
    }
  });
});
