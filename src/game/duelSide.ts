import { isDailyScenarioId } from './dailyChallenge';
import { operationScenarios } from './maps';

/** Missions and daily challenges are authored with a fixed human commander. */
export function supportsDuelSideChoice(mapId: string): boolean {
  return mapId !== 'training' && !isDailyScenarioId(mapId) && !operationScenarios.some((scenario) => scenario.id === mapId);
}
