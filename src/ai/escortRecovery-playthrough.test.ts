import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { chooseCpuAction } from './rules';
import { evaluationScenario } from '../../scripts/tacticsV151Scenario';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { valueOf } from '../game/operations.fixture';
import { createReplay, parseReplay, serializeReplay } from '../game/replay';
import { applyGameCommand, parseSavedGame, saveGame, type GameCommand } from '../game/session';
import { isGameOver, type GameState } from '../game/types';

it('seed15422: repairs the escorted APC, resumes and wins with a replayable history', () => {
  const initialState: GameState = { ...createScenarioInitialState(evaluationScenario(scenarioById('convoy-escort')!, 'default', 15422)), ruleVersion: 14 };
  let state = initialState,
    resumed = false;
  const commands: GameCommand[] = [];
  while (!isGameOver(state) && state.turn <= 60 && commands.length < 3000) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
    state = valueOf(applyGameCommand(state, command));
    commands.push(command);
    if (!resumed && state.turn === 9 && command.type === 'wait' && command.unitId === 'r1') {
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
          'escort',
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
  expect(state.evacuatedUnits?.some((unit) => unit.id === 'r1' && unit.hp > 0)).toBe(true);
  const replay = valueOf(createReplay({ mapId: 'convoy-escort', difficulty: 'easy', redDifficulty: 'hard', initialState, commands }));
  expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(JSON.parse(JSON.stringify(state)));
}, 30_000);

it('replays the v1.5.4 failure without recomputing CPU decisions', () => {
  const histories = JSON.parse(gunzipSync(readFileSync('docs/reviews/v1.5.4/after-fresh.jsonl.commands.json.gz')).toString()) as Record<string, GameCommand[]>;
  const initialState: GameState = { ...createScenarioInitialState(evaluationScenario(scenarioById('convoy-escort')!, 'default', 15422)), ruleVersion: 14 };
  const replay = valueOf(
    createReplay({ mapId: 'convoy-escort', difficulty: 'easy', redDifficulty: 'hard', initialState, commands: histories['convoy-escort/default/hard:easy/15422/outbound']! }),
  );
  const restored = valueOf(parseReplay(valueOf(serializeReplay(replay))));
  expect(restored.finalState.winner).toBe('blue');
  expect(restored.finalState.turn).toBe(16);
  expect(restored.finalState.units.some((unit) => unit.id === 'r1')).toBe(false);
}, 30_000);
