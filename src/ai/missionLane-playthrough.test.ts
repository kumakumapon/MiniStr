import { expect, it } from 'vitest';
import { evaluationScenario } from '../../scripts/tacticsV151Scenario';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { valueOf } from '../game/operations.fixture';
import { createReplay, parseReplay, serializeReplay } from '../game/replay';
import { applyGameCommand, parseSavedGame, saveGame, type GameCommand } from '../game/session';
import { isGameOver, type GameState } from '../game/types';
import { chooseCpuAction } from './rules';

it('seed15241: clears the escort exit, resumes a saved CPU turn and replays the full legal history', () => {
  const initialState: GameState = { ...createScenarioInitialState(evaluationScenario(scenarioById('convoy-escort')!, 'default', 15241)), ruleVersion: 14 };
  let state = initialState;
  const commands: GameCommand[] = [];
  let resumed = false;
  while (!isGameOver(state) && state.turn <= 60 && commands.length < 3000) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
    state = valueOf(applyGameCommand(state, command));
    commands.push(command);
    if (!resumed && state.turn >= 10 && state.activePlayer === 'red') {
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
          { mapId: 'convoy-escort', mode: 'spectate', difficulty: 'easy', redDifficulty: 'hard', initialState, gameState: state, commands },
        ),
      );
      const restored = valueOf(parseSavedGame(raw));
      expect(chooseCpuAction(restored.gameState, 'hard')).toEqual(chooseCpuAction(state, 'hard'));
      state = restored.gameState;
      resumed = true;
    }
  }
  expect(resumed).toBe(true);
  expect(state.winner).toBe('red');
  expect(state.turn).toBeLessThanOrEqual(60);
  expect(state.evacuatedUnits?.some((unit) => unit.id === 'r1')).toBe(true);
  const replay = valueOf(createReplay({ mapId: 'convoy-escort', difficulty: 'easy', redDifficulty: 'hard', initialState, commands }));
  expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(JSON.parse(JSON.stringify(state)));
}, 30_000);
