import { afterEach, describe, expect, it } from 'vitest';
import { applyGameCommand, createScenarioInitialState, maps, type GameState } from '../game';
import { chooseCpuAction, type CpuDifficulty } from './rules';

/**
 * Shared CPU-versus-CPU harness. Each difficulty lives in its own test file:
 * each turn is synchronous, and one file holding every difficulty kept the
 * worker busy long enough under coverage for Vitest's RPC to time out.
 */
export function playTurn(state: GameState, difficulty: CpuDifficulty): GameState {
  let current = state;
  // A side may produce, move, capture, and attack several times. The bound is
  // deliberately generous while still catching a CPU that stops consuming turns.
  for (let steps = 0; steps < 120 && !current.winner; steps += 1) {
    const command = chooseCpuAction(current, difficulty);
    const result = applyGameCommand(current, command);
    expect(result, `${difficulty} ${current.scenarioId ?? 'scenario'}: ${JSON.stringify(command)}`).toMatchObject({ ok: true });
    if (!result.ok) return current;
    current = result.value;
    if (command.type === 'endTurn') return current;
  }
  return current;
}

/** Allow covered 60-round games to finish, yielding between rounds for Vitest's RPC. */
export function describeBuiltInScenarioRegression(difficulty: CpuDifficulty): void {
  describe(`CPU-versus-CPU scenario regression at ${difficulty}`, () => {
    // Yield a macrotask between the synchronous matches so the worker can
    // answer Vitest's RPC (e.g. onTaskUpdate) instead of timing out.
    afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    it.each(maps.map((scenario) => [scenario.id, scenario] as const))(
      'runs %s without issuing illegal commands',
      async (_id, scenario) => {
        let state = createScenarioInitialState(scenario);
        for (let round = 0; round < 60 && !state.winner; round += 1) {
          const startingTurn = state.turn;
          state = playTurn(state, difficulty);
          if (!state.winner) state = playTurn(state, difficulty);
          expect(Boolean(state.winner) || state.turn > startingTurn, `${scenario.id}/${difficulty} must finish or advance a round`).toBe(true);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      },
      // The extended decision now permits 60 rounds instead of ending at 40.
      // main CI measured admiralty/normal at 41.4s with coverage; keep all rounds
      // and command/progression checks within a dedicated one-minute budget.
      60_000,
    );
  });
}
