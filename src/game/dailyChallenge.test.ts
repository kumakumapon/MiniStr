import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import { generateSymmetricMap } from './mapGenerator';
import { createReplay, parseReplay, serializeReplay } from './replay';
import { applyGameCommand, loadGame, MANUAL_SAVE_KEY, saveGame, type GameCommand, type StorageLike } from './session';
import { createScenarioInitialState, MAX_CUSTOM_SCENARIOS, saveCustomScenario, scenarioById, scenarioForState, type ScenarioDefinition } from './maps';
import { operationData } from './operations.fixture';
import type { GameState } from './types';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
  };
}

/** Plays the CPU on both sides until a winner appears; returns the legal command stream. */
function playOut(
  scenario: ScenarioDefinition,
  red: 'easy' | 'normal' | 'hard',
  blue: 'easy' | 'normal' | 'hard',
): { initial: GameState; commands: GameCommand[]; final: GameState } {
  const initial = createScenarioInitialState(scenario);
  let state = initial;
  const commands: GameCommand[] = [];
  while (!state.winner && state.turn <= 40) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? red : blue);
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(next.error);
    commands.push(command);
    state = next.value;
  }
  return { initial, commands, final: state };
}

describe('#230 precondition: an unsaved definition works without a custom slot', () => {
  it('starts, saves, resumes, replays and restarts with a full custom catalog', () => {
    const storage = memoryStorage();
    for (let at = 0; at < MAX_CUSTOM_SCENARIOS; at++) {
      const saved = saveCustomScenario(storage, operationData({ id: `custom-fill-${at}`, name: `fill ${at}` }));
      expect(saved.ok).toBe(true);
    }
    // The catalog is full: saving one more definition is rejected, which is why daily play cannot use it.
    expect(saveCustomScenario(storage, operationData({ id: 'custom-overflow' })).ok).toBe(false);

    const generated = generateSymmetricMap({ size: 16, sea: 'none', seed: 'D20260101' });
    if (!generated.ok) throw Error(generated.error);
    const definition = generated.value;
    expect(scenarioById(definition.id)).toBeUndefined();

    const played = playOut(definition, 'hard', 'easy');
    expect(played.final.winner).toBeDefined();
    // Mid-game checkpoint: save and resume resolve the unsaved definition from the embedded snapshot.
    const midway = played.commands.slice(0, 6);
    let mid = played.initial;
    for (const command of midway) {
      const next = applyGameCommand(mid, command);
      if (!next.ok) throw Error(next.error);
      mid = next.value;
    }
    const saved = saveGame(storage, MANUAL_SAVE_KEY, { mapId: definition.id, difficulty: 'normal', initialState: played.initial, commands: midway, gameState: mid });
    expect(saved.ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) return;
    const resolved = scenarioForState(loaded.value.initialState);
    expect(resolved?.id).toBe(definition.id);
    expect(scenarioById(definition.id)).toBeUndefined();

    // Replay of the finished match round-trips.
    const replay = createReplay({ mapId: definition.id, difficulty: 'normal', initialState: played.initial, commands: played.commands });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    const text = serializeReplay(replay.value);
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    expect(parseReplay(text.value).ok).toBe(true);

    // Restart (main.ts resetGame(selectedMap.id, scenarioForState(initialState))) restores the same definition.
    const restarted = createScenarioInitialState(scenarioForState(played.initial)!);
    expect(restarted).toEqual(played.initial);
    // The id-only path (the current #restart) would not find it.
    expect(scenarioById(definition.id)).toBeUndefined();
  });
});
