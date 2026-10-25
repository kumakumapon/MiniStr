import { operationData, valueOf } from './operations.fixture';
import { loadScenarioDefinitions, type ScenarioData } from './maps';
export function airliftData(withTransport = true): ScenarioData {
  const cells: Array<ScenarioData['board']['cells'][number]> = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 14; x++) if ((x < 3 || x > 9) && !(x === 0 && y === 0) && !(x === 11 && y === 2)) cells.push([x, y, 'plain']);
  cells.push([0, 0, 'airport', 'red'], [11, 2, 'capital', 'blue']);
  return operationData({
    id: 'airlift-fixture',
    name: 'Airlift',
    startingGold: 9000,
    board: { width: 14, height: 5, fill: 'sea', cells },
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 0, y: 2 },
      ...(withTransport ? [{ kind: 'transportHelicopter' as const, owner: 'red' as const, x: 1, y: 2 }] : []),
      { kind: 'infantry', owner: 'blue', x: 13, y: 4 },
    ],
    victoryConditions: [{ type: 'captureCapital' }],
    defeatConditions: [{ type: 'eliminate' }],
  });
}
export const airliftScenario = (withTransport = true) => valueOf(loadScenarioDefinitions([airliftData(withTransport)]))[0]!;
