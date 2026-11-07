import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import { createScenarioInitialState, scenarioById } from './maps';
import { tacticalScenario } from './tacticalMaps';
import { applyGameCommand, parseSavedGame, saveGame, type GameCommand } from './session';
import { createReplay, parseReplay, serializeReplay } from './replay';
import { valueOf } from './operations.fixture';
import type { GameState } from './types';
const witnesses = JSON.parse(gunzipSync(readFileSync(new URL('../../docs/reviews/v1.5.1/witnesses.commands.json.gz', import.meta.url))).toString()) as Record<
  string,
  { commands: GameCommand[] }
>;
for (const [id, witness] of Object.entries(witnesses)) {
  it(`${id}: restores a legal default-tactics victory against the real easy CPU`, () => {
    const initialState: GameState = { ...createScenarioInitialState(tacticalScenario(scenarioById(id)!)), ruleVersion: 14 };
    let state = initialState;
    for (const command of witness.commands) {
      if (state.activePlayer === 'blue') expect(command).toEqual(chooseCpuAction(state, 'easy'));
      state = valueOf(applyGameCommand(state, command));
    }
    expect(state.winner).toBe('red');
    expect(state.turn).toBeLessThanOrEqual(40);
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
        'witness',
        {
          mapId: id,
          difficulty: 'easy',
          initialState,
          gameState: state,
          commands: witness.commands,
        },
      ),
    );
    expect(valueOf(parseSavedGame(raw)).gameState).toEqual(state);
    const replay = valueOf(createReplay({ mapId: id, difficulty: 'easy', initialState, commands: witness.commands }));
    expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(state);
  }, 30_000);
}
