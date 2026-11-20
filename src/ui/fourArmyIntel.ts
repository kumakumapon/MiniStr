import { reachablePositions } from '../game/commands';
import { effectiveTerrainReduction } from '../game/combat';
import type { FourArmyObservation } from '../game/fourArmyEngine';
import { alliedArmies } from '../game/smallBattle';
import { defenseStars, positionKey, unitMovementCost } from '../game/terrain';
import { potentialThreat, type ThreatPreview } from '../game/threat';
import type { GameState, Position, UnitKind } from '../game/types';
import { getLocale } from './locale';
import { terrainNames, unitNames } from './labels';
import { escapeHtml } from './strings';
import { fourArmyName } from './fourArmyBattleView';
import type { FourArmyDisplay } from './fourArmyBoard';

/** The viewer's observation is the only source of contacts and occupancy. */
export function fourArmyThreats(observation: FourArmyObservation, projection: GameState, unitId?: string, targetKind?: UnitKind): ThreatPreview {
  const movement = new Set<string>();
  const attack = new Set<string>();
  const views = new Map<string, GameState>();
  for (const enemy of observation.units) {
    if (!enemy.position || (unitId && unitId !== enemy.id) || alliedArmies(observation.match, observation.viewer, enemy.owner)) continue;
    let view = views.get(enemy.owner);
    if (!view) {
      view = {
        ...projection,
        // An observed third army can exert ZOC on this enemy too. Do not use
        // the original viewer's private recon coverage as the enemy's vision.
        recon: undefined,
        units: observation.units.map((unit) => ({ ...unit, owner: alliedArmies(observation.match, enemy.owner, unit.owner) ? 'red' : 'blue' })),
      };
      views.set(enemy.owner, view);
    }
    const unit = view.units.find((unit) => unit.id === enemy.id)!;
    const danger = potentialThreat(view, { ...unit, position: enemy.position }, () => reachablePositions(view, enemy.id), targetKind);
    for (const key of danger.attack) attack.add(key);
    if (unitId) for (const key of danger.movement) movement.add(key);
  }
  return { movement, attack };
}

export function renderFourArmyTileInfo(display: FourArmyDisplay, position: Position, projection: GameState, kind?: UnitKind): string {
  const en = getLocale() === 'en';
  const tile = display.board.terrain[position.y]![position.x]!;
  const seen = !display.visible || display.visible.has(positionKey(position));
  const unit = seen ? display.units.find((u) => u.position?.x === position.x && u.position?.y === position.y) : undefined;
  const projectedUnit = unit && projection.units.find((u) => u.id === unit.id);
  const rows: [string, string][] = [
    [en ? 'Terrain' : '地形', terrainNames[tile.kind]],
    [en ? 'Terrain defense' : '地形防御', `★${defenseStars({ kind: tile.kind })}`],
  ];
  if (tile.owner) rows.push([en ? 'Controlled by' : '所有軍', fourArmyName(tile.owner)]);
  if (kind) {
    const cost = unitMovementCost(projection, position, kind);
    rows.push([en ? 'Move cost' : '移動コスト', `${unitNames[kind]} · ${Number.isFinite(cost) ? cost : en ? 'Impassable' : '進入不可'}`]);
  }
  if (display.bridges?.some((b) => positionKey(b.position) === positionKey(position))) rows.push([en ? 'Crossing' : '渡河', en ? 'Temporary bridge' : '仮設橋']);
  if (seen && tile.capturePoints !== undefined) rows.push([en ? 'Capture remaining' : '占領残値', String(tile.capturePoints)]);
  if (unit) rows.push([en ? 'Visible unit' : '視認部隊', `${fourArmyName(unit.owner)} ${unitNames[unit.kind]} · HP ${unit.hp}`]);
  if (projectedUnit) rows.push([en ? 'Damage reduction' : '地形による軽減', `${Math.round(effectiveTerrainReduction(projection, projectedUnit))}%`]);
  return `<dl class="tile-inspector-rows">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${seen ? '' : `<p class="tile-inspector-fog">${en ? 'Unseen. Unit and capture details are hidden.' : '未索敵。部隊と占領の詳細は表示されません。'}</p>`}`;
}

/** Fall back to the focused friendly unit when no unit has been selected for movement. */
export function fourArmyMovementKind(observation: FourArmyObservation, position: Position): UnitKind | undefined {
  return observation.units.find((u) => u.position?.x === position.x && u.position?.y === position.y && alliedArmies(observation.match, observation.viewer, u.owner))?.kind;
}
