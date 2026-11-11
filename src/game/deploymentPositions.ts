import { createDeploymentScenario } from './deployment';
import { isEvacuationCondition, loadScenarioDefinitions, maps, scenarioDefinitionToData, type ScenarioDefinition } from './maps';
import { tacticalScenario } from './tacticalMaps';
import { movementCost, positionKey, samePosition } from './terrain';
import type { GameResult, PlayerId, Position, UnitKind } from './types';
import { unitCategory } from './units';

export type DeploymentPlacements = Record<PlayerId, Position[]>;
export type ReadonlyDeploymentPlacements = Readonly<Record<PlayerId, readonly Position[]>>;

/** Only the current standalone catalog definition and its standard tactical variant opt in. */
export function supportsDeploymentPositions(scenario: ScenarioDefinition): boolean {
  if (scenario.id !== 'canyon') return false;
  const base = maps.find((entry) => entry.id === 'canyon');
  return !!base && (scenario === base || scenario === tacticalScenario(base));
}

export function defaultDeploymentPlacements(scenario: ScenarioDefinition): DeploymentPlacements {
  return {
    red: scenario.initialUnits.filter((unit) => unit.owner === 'red').map(({ x, y }) => ({ x, y })),
    blue: scenario.initialUnits.filter((unit) => unit.owner === 'blue').map(({ x, y }) => ({ x, y })),
  };
}

/** Zero-based red x=0..3/y=1..4; blue is the exact 180-degree counterpart. */
export function deploymentPositionArea(scenario: ScenarioDefinition, player: PlayerId): Position[] {
  if (!supportsDeploymentPositions(scenario)) return [];
  const area: Position[] = [];
  for (let y = 1; y <= 4; y++) for (let x = 0; x <= 3; x++) area.push(player === 'red' ? { x, y } : { x: scenario.board.width - 1 - x, y: scenario.board.height - 1 - y });
  return area.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Position locks are independent of the existing unit-type choices. */
export function isFixedDeploymentPosition(scenario: ScenarioDefinition, player: PlayerId, index: number): boolean {
  const unit = scenario.initialUnits.filter((entry) => entry.owner === player)[index];
  if (!unit || unitCategory[unit.kind] === 'air' || unitCategory[unit.kind] === 'sea') return true;
  const id = `${player[0]}${index + 1}`;
  const objectives = player === 'red' ? scenario.victoryConditions : scenario.defeatConditions;
  return objectives.some((condition) => isEvacuationCondition(condition) && condition.unitIds.includes(id));
}

export function deploymentPositionOptions(scenario: ScenarioDefinition, player: PlayerId, index: number, placements: ReadonlyDeploymentPlacements, kind: UnitKind): Position[] {
  if (isFixedDeploymentPosition(scenario, player, index)) return [];
  const occupied = new Set((['red', 'blue'] as const).flatMap((owner) => placements[owner].filter((_, slot) => owner !== player || slot !== index).map(positionKey)));
  return deploymentPositionArea(scenario, player).filter((position) => !occupied.has(positionKey(position)) && Number.isFinite(movementCost(scenario.board, position, kind)));
}

/** Build from the immutable base on every edit; never move/reorder the authored slots. */
export function createPositionedDeploymentScenario(
  base: ScenarioDefinition,
  choices: Readonly<Record<PlayerId, readonly UnitKind[]>>,
  placements: ReadonlyDeploymentPlacements,
  editablePlayers: readonly PlayerId[],
): GameResult<ScenarioDefinition> {
  if (
    !choices ||
    !placements ||
    !supportsDeploymentPositions(base) ||
    !editablePlayers.length ||
    new Set(editablePlayers).size !== editablePlayers.length ||
    editablePlayers.some((p) => p !== 'red' && p !== 'blue')
  )
    return { ok: false, error: 'この作戦・モードでは出撃位置を変更できません。' };
  let planned = base;
  for (const player of editablePlayers) {
    const selected = createDeploymentScenario(planned, choices[player], player);
    if (!selected.ok) return selected;
    planned = selected.value;
  }
  const defaults = defaultDeploymentPlacements(base);
  const effective: ReadonlyDeploymentPlacements = {
    red: editablePlayers.includes('red') ? placements.red : defaults.red,
    blue: editablePlayers.includes('blue') ? placements.blue : defaults.blue,
  };
  for (const player of ['red', 'blue'] as const) {
    const units = base.initialUnits.filter((unit) => unit.owner === player);
    const selectedUnits = planned.initialUnits.filter((unit) => unit.owner === player);
    const positions = effective[player];
    if (!Array.isArray(positions) || positions.length !== units.length) return { ok: false, error: '出撃位置の部隊数が一致しません。' };
    const area = new Set(deploymentPositionArea(base, player).map(positionKey));
    for (let index = 0; index < units.length; index++) {
      const position = positions[index];
      if (!position || !Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)) return { ok: false, error: '出撃位置は整数の座標で指定してください。' };
      if (isFixedDeploymentPosition(base, player, index)) {
        if (!samePosition(position, units[index]!)) return { ok: false, error: '航空・海上・任務対象の位置は固定です。' };
      } else if (!area.has(positionKey(position)) || !Number.isFinite(movementCost(base.board, position, selectedUnits[index]!.kind)))
        return { ok: false, error: '自軍の配置区域内の通行できるマスを選んでください。' };
    }
  }
  const keys = [...effective.red, ...effective.blue].map(positionKey);
  if (new Set(keys).size !== keys.length) return { ok: false, error: '出撃位置に別の部隊がいます。' };
  const data = scenarioDefinitionToData(planned);
  const indices = { red: 0, blue: 0 };
  data.initialUnits = data.initialUnits.map((unit) => {
    const position = effective[unit.owner][indices[unit.owner]++]!;
    return { ...unit, x: position.x, y: position.y };
  });
  const loaded = loadScenarioDefinitions([data]);
  return loaded.ok ? { ok: true, value: loaded.value[0]! } : loaded;
}
