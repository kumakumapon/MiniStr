import { expect, it } from 'vitest';
import { operation } from './operations.fixture';
import { tacticalScenario } from './tacticalMaps';
import { scenarioDefinitionToData } from './maps';
import { operationRevision } from './operationRecords';

it('connects both tactical approaches to supply symmetrically while retaining source and saved snapshots', () => {
  const source = operation({
    board: { width: 32, height: 32, cells: [] },
    victoryConditions: [{ type: 'eliminate' }],
    defeatConditions: [{ type: 'eliminate' }],
    initialUnits: [
      { kind: 'tank', owner: 'red', x: 0, y: 0 },
      { kind: 'infantry', owner: 'blue', x: 31, y: 31 },
    ],
  });
  const original = scenarioDefinitionToData(source);
  const revised = tacticalScenario(source);
  expect(revised.name).toContain('Tactical v2');
  expect(revised.board.terrain[11]![10]!.kind).toBe('road');
  expect(revised.board.terrain[20]![21]!.kind).toBe('road');
  expect(scenarioDefinitionToData(source)).toEqual(original);
  expect(tacticalScenario(revised)).toBe(revised);
  const historical = { ...revised, name: 'Saved Tactical v1', board: source.board };
  expect(tacticalScenario(historical)).toBe(historical);
  expect(operationRevision(historical)).not.toBe(operationRevision(revised));
});

it('preserves water, properties, initial deployments and mission targets on a connector', () => {
  const source = operation({
    board: {
      width: 32,
      height: 32,
      cells: [
        [10, 11, 'sea'],
        [10, 12, 'city', 'red'],
        [21, 20, 'mountain'],
      ],
    },
    initialUnits: [
      { kind: 'tank', owner: 'red', x: 21, y: 20 },
      { kind: 'infantry', owner: 'blue', x: 30, y: 30 },
    ],
    victoryConditions: [{ type: 'hold', positions: [{ x: 10, y: 13 }], turns: 2 }],
  });
  const revised = tacticalScenario(source);
  for (const [x, y] of [
    [10, 11],
    [10, 12],
    [21, 20],
    [10, 13],
  ])
    expect(revised.board.terrain[y!]![x!]).toEqual(source.board.terrain[y!]![x!]);
});
