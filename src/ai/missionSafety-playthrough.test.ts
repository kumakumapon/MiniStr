import { expect, it } from 'vitest';
import { chooseCpuAction } from './rules';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { tacticalScenario } from '../game/tacticalMaps';
import { applyGameCommand, parseSavedGame, saveGame, type GameCommand } from '../game/session';
import { createReplay, parseReplay, serializeReplay } from '../game/replay';
import { isGameOver, type GameState } from '../game/types';
import { valueOf } from '../game/operations.fixture';

for (const id of ['convoy-escort', 'river-withdrawal', 'fighting-withdrawal', 'encirclement-breakout']) {
  it(`${id}: real default-tactics CPUs evacuate the required survivors and round-trip their history`, () => {
    const initialState: GameState = { ...createScenarioInitialState(tacticalScenario(scenarioById(id)!)), ruleVersion: 14 };
    let state = initialState;
    const commands: GameCommand[] = [];
    while (!isGameOver(state) && state.turn <= 60 && commands.length < 3000) {
      const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
      state = valueOf(applyGameCommand(state, command));
      commands.push(command);
    }
    expect(state.winner).toBe('red');
    expect(state.turn).toBeLessThanOrEqual(60);
    expect(state.evacuatedUnits?.some((unit) => unit.owner === 'red')).toBe(true);
    expect(initialState.ruleVersion).toBe(14);
    let raw = '';
    valueOf(
      saveGame(
        {
          getItem: () => raw,
          setItem: (_key, value) => {
            raw = value;
          },
          removeItem: () => {},
        },
        'mission',
        { mapId: id, difficulty: 'easy', initialState, gameState: state, commands },
      ),
    );
    expect(valueOf(parseSavedGame(raw)).gameState).toEqual(state);
    const replay = valueOf(createReplay({ mapId: id, difficulty: 'easy', initialState, commands }));
    expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(state);
  }, 30_000);
}
