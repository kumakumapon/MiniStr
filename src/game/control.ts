import type { ScenarioDefinition } from './maps';
import { usesReconRules, type GameState } from './types';

export const controlObjective = (scenario: ScenarioDefinition | undefined) => scenario?.victoryConditions.find((condition) => condition.type === 'control');

/** Ownership is public for these designated objectives. Both armies score from the same round-end board. */
export function updateControlScores(state: GameState, scenario: ScenarioDefinition): GameState {
  const objective = controlObjective(scenario);
  if (!usesReconRules(state) || state.activePlayer !== 'blue' || !objective) return state;
  const scores = { red: state.controlScores?.red ?? 0, blue: state.controlScores?.blue ?? 0 };
  for (const p of objective.positions) {
    const owner = state.board.terrain[p.y]![p.x]!.owner;
    if (owner) scores[owner] = Math.min(Number.MAX_SAFE_INTEGER, scores[owner] + 1);
  }
  return { ...state, controlScores: scores };
}
