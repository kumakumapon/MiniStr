import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import { BattleHistory } from './battleHistory';
import { maps, operationScenarios, trainingScenario, createScenarioInitialState, scenarioDefinitionToData } from './maps';
import { canonicalOperationValue, operationVictory } from './operationRecords';
import { parseSavedGame, replayCommands, saveGame, applyGameCommand, type GameCommand } from './session';
import { createReplay, parseReplay, serializeReplay } from './replay';
import { learningSteps } from '../ui/learningSteps';
import { v146CatalogHashes } from './v146Catalog.fixture';
import { valueOf } from './operations.fixture';

const setups: Record<string, GameCommand[]> = {
  'tactics-supply': [
    { type: 'move', unitId: 'r1', destination: { x: 4, y: 3 } },
    { type: 'capture', unitId: 'r1' },
    { type: 'move', unitId: 'r2', destination: { x: 4, y: 2 } },
    { type: 'move', unitId: 'r3', destination: { x: 3, y: 3 } },
    { type: 'move', unitId: 'r4', destination: { x: 3, y: 4 } },
    { type: 'produce', factory: { x: 0, y: 3 }, kind: 'infantry' },
    { type: 'endTurn' },
  ],
  'tactics-crossing': [
    { type: 'recon', center: { x: 8, y: 3 } },
    { type: 'bridge', unitId: 'r1', destination: { x: 5, y: 3 } },
    { type: 'embark', unitId: 'r2', transportId: 'r3' },
    { type: 'endTurn' },
  ],
};

it('preserves every released v1.4.6 scenario definition, including initial forces and briefings', () => {
  const old = [...maps, ...operationScenarios, trainingScenario].filter((map) => !map.id.startsWith('tactics-'));
  expect(
    Object.fromEntries(
      old.map((map) => [
        map.id,
        createHash('sha256')
          .update(canonicalOperationValue(scenarioDefinitionToData(map)))
          .digest('hex'),
      ]),
    ),
  ).toEqual(v146CatalogHashes);
});

for (const id of Object.keys(setups)) {
  it(`${id}: completes every guide task through legal commands and restores the same save/replay history`, () => {
    const scenario = operationScenarios.find((map) => map.id === id)!;
    const initial = { ...createScenarioInitialState(scenario), ruleVersion: 13 as const };
    let state = initial;
    const commands: GameCommand[] = [];
    const apply = (command: GameCommand) => {
      state = valueOf(applyGameCommand(state, command));
      commands.push(command);
    };
    for (const command of setups[id]!) apply(command);
    // Continue the demonstrated opening against the real easy CPU, with no teleporting or state edits.
    while (!state.winner && !state.draw && state.turn <= 30 && commands.length < 3000) apply(chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy'));
    expect(state.winner).toBe('red');
    expect(commands.length).toBeLessThan(3000);
    const progress = valueOf(new BattleHistory(initial, commands).learning(commands.length, 'red'));
    expect(learningSteps(state, 'red', progress)?.map((step) => step.done)).toEqual(Array(6).fill(true));
    expect(valueOf(operationVictory(initial, state, commands, 'easy')).scenarioId).toBe(id);
    let raw = '';
    valueOf(
      saveGame(
        {
          getItem: () => raw,
          setItem: (_key, text) => {
            raw = text;
          },
          removeItem: () => {},
        },
        'test',
        { mapId: id, difficulty: 'easy', initialState: initial, gameState: state, commands },
      ),
    );
    const restored = valueOf(parseSavedGame(raw));
    expect(restored.gameState).toEqual(state);
    const imported = valueOf(parseReplay(valueOf(serializeReplay(valueOf(createReplay({ mapId: id, difficulty: 'easy', initialState: initial, commands }))))));
    expect(imported.finalState).toEqual(state);
    expect(valueOf(new BattleHistory(restored.initialState, restored.commands).learning(commands.length, 'red'))).toEqual(progress);
    // Undo/replay uses the same prefix instead of retaining completed flags from the future.
    const prefix = commands.slice(0, 1);
    expect(valueOf(replayCommands(initial, prefix)).winner).toBeUndefined();
    expect(valueOf(new BattleHistory(initial, prefix).learning(prefix.length, 'red')).missionEvacuate).toBe(false);
  }, 30_000);

  for (const difficulty of ['normal', 'hard'] as const)
    it(`${id}: ${difficulty} CPU can solve the objective from its original setup`, () => {
      let state = { ...createScenarioInitialState(operationScenarios.find((map) => map.id === id)!), ruleVersion: 13 as const };
      let count = 0;
      while (!state.winner && !state.draw && state.turn <= 30 && count++ < 3000)
        state = valueOf(applyGameCommand(state, chooseCpuAction(state, state.activePlayer === 'red' ? difficulty : 'easy')));
      expect(state.winner).toBe('red');
      expect(count).toBeLessThan(3000);
    }, 30_000);
}
