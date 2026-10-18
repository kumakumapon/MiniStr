import { isEvacuationCondition, loadScenarioDefinitions, scenarioDefinitionToData, type ScenarioDefinition } from './maps';
import { movementCost } from './terrain';
import { unitCategory, unitKindSet, unitStats } from './units';
import type { GameResult, PlayerId, UnitKind } from './types';

export interface DeploymentSlot {
  id: string;
  index: number;
  kind: UnitKind;
  x: number;
  y: number;
  fixed: boolean;
  choices: UnitKind[];
}

const domain = (kind: UnitKind) => (unitCategory[kind] === 'air' ? 'air' : unitCategory[kind] === 'sea' ? 'sea' : 'ground');

/** Stable initial IDs and positions keep mission targets and saved initial states reproducible. */
export function deploymentSlots(scenario: ScenarioDefinition, player: PlayerId = 'red'): DeploymentSlot[] {
  const conditions = player === 'red' ? scenario.victoryConditions : scenario.defeatConditions;
  const protectedIds = new Set(
    conditions
      .filter(isEvacuationCondition)
      .filter((condition) => condition.type === 'escort')
      .flatMap((condition) => condition.unitIds),
  );
  return scenario.initialUnits
    .filter((unit) => unit.owner === player)
    .map((unit, index) => {
      const id = `${player[0]}${index + 1}`;
      const fixed = protectedIds.has(id) || unit.kind === 'landingShip';
      const choices = fixed
        ? [unit.kind]
        : (Object.keys(unitStats) as UnitKind[]).filter((kind) => domain(kind) === domain(unit.kind) && Number.isFinite(movementCost(scenario.board, unit, kind)));
      return { id, index, kind: unit.kind, x: unit.x, y: unit.y, fixed, choices };
    });
}

export function deploymentBudget(scenario: ScenarioDefinition, player: PlayerId = 'red'): number {
  return scenario.initialUnits.filter((unit) => unit.owner === player).reduce((sum, unit) => sum + unitStats[unit.kind].cost, 0);
}

/** The fixed-size slots are the unit limit; budget is the original army's purchase value. */
export function createDeploymentScenario(
  scenario: ScenarioDefinition,
  choices: readonly UnitKind[],
  player: PlayerId = 'red',
  veterans?: readonly { kind: UnitKind; experience: number }[],
): GameResult<ScenarioDefinition> {
  const slots = deploymentSlots(scenario, player);
  if (!Array.isArray(choices) || choices.length !== slots.length || choices.some((kind, index) => !unitKindSet.has(kind) || !slots[index]!.choices.includes(kind)))
    return { ok: false, error: '編成の配置枠・兵科・地形または固定対象が不正です。' };
  const selected: readonly UnitKind[] = choices;
  const cost = selected.reduce((sum, kind) => sum + unitStats[kind].cost, 0);
  const budget = deploymentBudget(scenario, player);
  if (cost > budget) return { ok: false, error: `編成予算を${cost - budget}G超過しています。` };
  const conditions = player === 'red' ? scenario.victoryConditions : scenario.defeatConditions;
  const requiredCapturers = Math.min(
    slots.filter((slot) => unitStats[slot.kind].capturePower > 0).length,
    Math.max(
      0,
      ...conditions.map((condition) => (condition.type === 'captureCapital' ? 1 : condition.type === 'hold' && condition.requireOwnership ? condition.positions.length : 0)),
    ),
  );
  if (selected.filter((kind) => unitStats[kind].capturePower > 0).length < requiredCapturers)
    return { ok: false, error: `占領できる歩兵系を${requiredCapturers}部隊以上残してください。` };
  const pool = (
    veterans ?? scenario.initialUnits.filter((unit) => unit.owner === player && unit.experience !== undefined).map((unit) => ({ kind: unit.kind, experience: unit.experience! }))
  )
    .map((unit) => ({ ...unit }))
    .sort((a, b) => b.experience - a.experience);
  let index = 0;
  const initialUnits = scenario.initialUnits.map((unit) => {
    if (unit.owner !== player) return { ...unit };
    const kind = selected[index++]!;
    const veteranIndex = pool.findIndex((candidate) => candidate.kind === kind);
    const veteran = veteranIndex < 0 ? undefined : pool.splice(veteranIndex, 1)[0];
    const result = { ...unit, kind };
    delete result.experience;
    return veteran ? { ...result, experience: veteran.experience } : result;
  });
  const source = scenarioDefinitionToData(scenario);
  const bonus = player === 'red' ? 'firstPlayerBonus' : 'secondPlayerBonus';
  // Recompute from the immutable default scenario on each UI edit, preventing
  // repeated previews or retries from accumulating unspent-budget grants.
  const loaded = loadScenarioDefinitions([{ ...source, initialUnits, [bonus]: (source[bonus] ?? 0) + budget - cost }]);
  return loaded.ok ? { ok: true, value: loaded.value[0]! } : loaded;
}
