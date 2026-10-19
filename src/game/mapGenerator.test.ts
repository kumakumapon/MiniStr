import { describe, expect, it } from 'vitest';
import { GENERATED_SEAS, GENERATED_SIZES, generateSymmetricMap, inspectGeneratedMap } from './mapGenerator';
import { createScenarioInitialState, scenarioDefinitionToData } from './maps';
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
