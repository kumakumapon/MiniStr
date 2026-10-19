import { createScenarioInitialState, scenarioById } from '../src/game/maps';
import { applyGameCommand, saveGame, MANUAL_SAVE_KEY, type GameCommand, type SavedMatchMode } from '../src/game/session';
import { operationData, valueOf } from '../src/game/operations.fixture';

export function finishedDefense(mode: SavedMatchMode = 'cpu') {
  const initialState = createScenarioInitialState(scenarioById('frontier-defense')!),
    commands: GameCommand[] = [];
  let gameState = initialState;
  while (!gameState.winner) {
    commands.push({ type: 'endTurn' });
    gameState = valueOf(applyGameCommand(gameState, commands.at(-1)!));
  }
  const saved = valueOf(
    saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, MANUAL_SAVE_KEY, {
      mapId: initialState.scenarioId!,
      initialState,
      gameState,
      commands,
      difficulty: 'easy',
      mode,
    }),
  );
  return { initialState, gameState, commands, serialized: JSON.stringify(saved) };
}
export const scanScenarioData = () =>
  operationData({
    id: 'wide-recon-ui',
    name: '広域偵察の操作確認',
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 0, y: 1 },
      { kind: 'tank', owner: 'blue', x: 7, y: 2 },
    ],
    victoryConditions: [{ type: 'survive', untilTurn: 100 }],
    defeatConditions: [{ type: 'survive', untilTurn: 101 }],
  });
