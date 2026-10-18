import { isEvacuationCondition, scenarioForState, type EvacuationCondition } from './maps';
import { isDeployedUnit, usesOperationsRules, type GameState, type PlayerId } from './types';

export function evacuationObjectives(state: GameState, player: PlayerId): EvacuationCondition[] {
  if (!usesOperationsRules(state)) return [];
  const scenario = scenarioForState(state);
  return (player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions)?.filter(isEvacuationCondition) ?? [];
}

export function isEvacuationTarget(state: GameState, unitId: string, player: PlayerId): boolean {
  return evacuationObjectives(state, player).some((condition) => condition.unitIds.includes(unitId));
}

/** Targets aboard a transport remain alive; evacuated targets are safe survivors. */
export function evacuationImpossible(state: GameState, player: PlayerId): boolean {
  const objectives = evacuationObjectives(state, player);
  if (!objectives.length) return false;
  const surviving = new Set([...state.units, ...(state.evacuatedUnits ?? [])].filter((unit) => unit.owner === player).map((unit) => unit.id));
  return objectives.some((condition) => condition.unitIds.filter((id) => surviving.has(id)).length < condition.required);
}

export function canEvacuateUnit(state: GameState, unitId: string): boolean {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  return (
    !state.winner &&
    !!unit &&
    isDeployedUnit(unit) &&
    unit.owner === state.activePlayer &&
    !unit.hasActed &&
    !state.units.some((candidate) => candidate.embarkedIn === unit.id) &&
    evacuationObjectives(state, unit.owner).some(
      (condition) => condition.unitIds.includes(unitId) && condition.positions.some((position) => position.x === unit.position.x && position.y === unit.position.y),
    )
  );
}
