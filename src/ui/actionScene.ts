import type { GameCommand, GameState, PlayerId, Position, TerrainKind, UnitKind } from '../game';
import { adjacentToSupplyUnit, isDeployedUnit, isServiceTile, isSupplyUnit, unitStats } from '../game';
import { unitNames, terrainNames } from './labels';
import { getLocale } from './locale';
import { escapeHtml } from './strings';

const CAPTURE_POINTS = 20;
export const ACTION_SCENE_DURATION_MS = 1_800;

export interface CaptureActionScene {
  kind: 'capture';
  unitKind: UnitKind;
  owner: PlayerId;
  position: Position;
  terrain: TerrainKind;
  propertyOwner?: PlayerId;
  progressBefore: number;
  progressAfter: number;
  captured: boolean;
}

export interface LogisticsResourceChange {
  resource: 'hp' | 'fuel' | 'ammo';
  before: number;
  after: number;
}

export interface LogisticsChange {
  kind: UnitKind;
  owner: PlayerId;
  position: Position;
  source:
    | { type: 'facility'; terrain: TerrainKind }
    | { type: 'supply'; kind: UnitKind; position: Position }
    | { type: 'transport'; kind: UnitKind; position: Position }
    | { type: 'field' };
  resources: LogisticsResourceChange[];
}

export interface LogisticsActionScene {
  kind: 'logistics';
  owner: PlayerId;
  changes: LogisticsChange[];
}

export type ActionScene = CaptureActionScene | LogisticsActionScene;

function captureProgress(owner: PlayerId | undefined, unitOwner: PlayerId, remaining: number | undefined): number {
  if (owner === unitOwner) return 100;
  return Math.max(0, Math.min(100, 100 - ((remaining ?? CAPTURE_POINTS) * 100) / CAPTURE_POINTS));
}

/** Builds a capture or turn-start logistics scene from resolved state changes only. */
export function actionSceneForCommand(before: GameState, command: GameCommand, after: GameState): ActionScene | undefined {
  if (command.type === 'capture') {
    const unitBefore = before.units.find((unit) => unit.id === command.unitId);
    const unitAfter = after.units.find((unit) => unit.id === command.unitId);
    if (!unitBefore || !isDeployedUnit(unitBefore) || !unitAfter || !isDeployedUnit(unitAfter)) return undefined;
    const terrainBefore = before.board.terrain[unitBefore.position.y]?.[unitBefore.position.x];
    const terrainAfter = after.board.terrain[unitAfter.position.y]?.[unitAfter.position.x];
    if (!terrainBefore || !terrainAfter) return undefined;
    return {
      kind: 'capture',
      unitKind: unitBefore.kind,
      owner: unitBefore.owner,
      position: { ...unitBefore.position },
      terrain: terrainAfter.kind,
      propertyOwner: terrainAfter.owner,
      progressBefore: captureProgress(terrainBefore.owner, unitBefore.owner, terrainBefore.capturePoints),
      progressAfter: captureProgress(terrainAfter.owner, unitBefore.owner, terrainAfter.capturePoints),
      captured: terrainBefore.owner !== unitBefore.owner && terrainAfter.owner === unitBefore.owner,
    };
  }
  if (command.type !== 'endTurn') return undefined;

  const owner = after.activePlayer;
  const changes: LogisticsChange[] = [];
  for (const unit of after.units) {
    if (unit.owner !== owner) continue;
    const previous = before.units.find((candidate) => candidate.id === unit.id);
    if (!previous) continue;
    const stats = unitStats[unit.kind];
    const resources: LogisticsResourceChange[] = [];
    const hpBefore = previous.hp;
    if (unit.hp > hpBefore) resources.push({ resource: 'hp', before: hpBefore, after: unit.hp });
    const fuelBefore = previous.fuel ?? stats.fuel;
    const fuelAfter = unit.fuel ?? stats.fuel;
    if (fuelAfter > fuelBefore)
      resources.push({
        resource: 'fuel',
        before: fuelBefore,
        after: fuelAfter,
      });
    const ammoBefore = previous.ammo ?? stats.ammo;
    const ammoAfter = unit.ammo ?? stats.ammo;
    if (ammoAfter > ammoBefore)
      resources.push({
        resource: 'ammo',
        before: ammoBefore,
        after: ammoAfter,
      });
    if (!resources.length) continue;

    const carrier = unit.embarkedIn ? after.units.find((candidate) => candidate.id === unit.embarkedIn) : undefined;
    const position = isDeployedUnit(unit) ? unit.position : carrier && isDeployedUnit(carrier) ? carrier.position : (previous.position ?? { x: 0, y: 0 });

    let source: LogisticsChange['source'] = { type: 'field' };
    if (isDeployedUnit(unit) && isServiceTile(after, unit.position, unit.kind, owner)) {
      const terrain = after.board.terrain[unit.position.y]?.[unit.position.x];
      if (terrain) source = { type: 'facility', terrain: terrain.kind };
    } else if (carrier && isDeployedUnit(carrier)) {
      source = isSupplyUnit(carrier.kind)
        ? {
            type: 'supply',
            kind: carrier.kind,
            position: { ...carrier.position },
          }
        : {
            type: 'transport',
            kind: carrier.kind,
            position: { ...carrier.position },
          };
    } else {
      const supplier = after.units.find(
        (candidate) =>
          candidate.owner === owner &&
          candidate.id !== unit.id &&
          isDeployedUnit(candidate) &&
          isSupplyUnit(candidate.kind) &&
          Math.abs(candidate.position.x - position.x) + Math.abs(candidate.position.y - position.y) === 1,
      );
      if (supplier && isDeployedUnit(supplier))
        source = {
          type: 'supply',
          kind: supplier.kind,
          position: { ...supplier.position },
        };
      else if (isDeployedUnit(unit) && adjacentToSupplyUnit(after, unit.position, owner, unit.id)) source = { type: 'field' };
    }

    changes.push({
      kind: unit.kind,
      owner: unit.owner,
      position: { ...position },
      source,
      resources,
    });
  }

  return changes.length ? { kind: 'logistics', owner, changes } : undefined;
}

/** Removes action details outside the current viewer's visible tiles. */
export function actionSceneForVisiblePositions(scene: ActionScene, visible: ReadonlySet<string>): ActionScene | undefined {
  const seen = (position: Position) => visible.has(`${position.x},${position.y}`);
  if (scene.kind === 'capture') return seen(scene.position) ? scene : undefined;
  const changes = scene.changes
    .filter((change) => seen(change.position))
    .map((change) => {
      const source = change.source;
      return (source.type === 'supply' || source.type === 'transport') && !seen(source.position) ? { ...change, source: { type: 'field' as const } } : change;
    });
  return changes.length ? { ...scene, changes } : undefined;
}

function unitSprite(kind: UnitKind, owner: PlayerId, label: string): string {
  return `<span class="unit battle-sprite ${owner} unit-${kind} action-scene-sprite" aria-hidden="true"><span class="unit-art"></span><span class="visually-hidden">${escapeHtml(label)}</span></span>`;
}

function renderCaptureScene(scene: CaptureActionScene, english: boolean): string {
  const title = scene.captured ? (english ? 'Property captured' : '拠点を占領') : english ? 'Capture in progress' : '占領を進行中';
  const detail = scene.captured
    ? english
      ? 'The property is now under your control.'
      : '拠点を自軍の支配下に置きました。'
    : english
      ? 'Keep a unit here to complete the capture.'
      : '部隊を維持すると占領が完了します。';
  return `<header class="action-scene-header">
      <div><p class="card-kicker">${english ? 'PROPERTY OPERATION' : '拠点作戦'}</p><h2 id="tactical-scene-title">${title}</h2></div>
      <span class="action-scene-terrain">${escapeHtml(terrainNames[scene.terrain])}</span>
    </header>
    <div class="action-capture-stage">
      ${unitSprite(scene.unitKind, scene.owner, unitNames[scene.unitKind])}
      <span class="action-scene-arrow" aria-hidden="true">▶</span>
      <div class="action-capture-property ${scene.propertyOwner ?? ''}">
        <span class="action-capture-building" aria-hidden="true">⌂</span>
        <span class="action-capture-flag" aria-hidden="true">⚑</span>
      </div>
    </div>
    <div class="action-capture-progress" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(scene.progressAfter)}" aria-label="${english ? 'Capture progress' : '占領の進行度'}">
      <span class="action-capture-progress-fill ${scene.owner}" style="--capture-before:${scene.progressBefore}%;--capture-after:${scene.progressAfter}%"></span>
    </div>
    <p class="action-scene-detail">${detail} <strong>${Math.round(scene.progressAfter)}%</strong></p>`;
}

function sourceLabel(source: LogisticsChange['source'], english: boolean): string {
  if (source.type === 'facility') return english ? `Serviced at ${terrainNames[source.terrain]}` : `${terrainNames[source.terrain]}で整備`;
  if (source.type === 'supply') return english ? `Supplied by ${unitNames[source.kind]}` : `${unitNames[source.kind]}から補給`;
  if (source.type === 'transport') return english ? `Carried by ${unitNames[source.kind]}` : `${unitNames[source.kind]}に搭載中`;
  return english ? 'Supplies replenished' : '補給を受けました';
}

function renderLogisticsScene(scene: LogisticsActionScene, english: boolean): string {
  const changes = scene.changes.slice(0, 4);
  const extraCount = scene.changes.length - changes.length;
  const resourceLabels = english ? { hp: 'HP', fuel: 'FUEL', ammo: 'AMMO' } : { hp: '耐久', fuel: '燃料', ammo: '弾薬' };
  return `<header class="action-scene-header">
      <div><p class="card-kicker">SUPPLY &amp; SERVICE</p><h2 id="tactical-scene-title">${english ? 'Resupply and repairs' : '補給・整備'}</h2></div>
      <span class="action-scene-terrain">${english ? `${scene.changes.length} units serviced` : `${scene.changes.length}部隊を整備`}</span>
    </header>
    <div class="action-logistics-list">
      ${changes
        .map(
          (change, index) => `<article class="action-logistics-card" style="--item-index:${index}">
        ${unitSprite(change.kind, change.owner, unitNames[change.kind])}
        <div class="action-logistics-info">
          <strong>${escapeHtml(unitNames[change.kind])}</strong>
          <span class="action-logistics-source">${escapeHtml(sourceLabel(change.source, english))}</span>
          <ul>${change.resources.map((resource) => `<li><span>${resourceLabels[resource.resource]}</span><b>${resource.before} → ${resource.after}</b></li>`).join('')}</ul>
        </div>
      </article>`,
        )
        .join('')}
      ${extraCount > 0 ? `<p class="action-logistics-extra">${english ? `and ${extraCount} more` : `ほか ${extraCount}部隊`}</p>` : ''}
    </div>`;
}

/** Skippable command tableau for captures and turn-start supply/service. */
export function renderActionScene(scene: ActionScene): string {
  const english = getLocale() === 'en';
  const content = scene.kind === 'capture' ? renderCaptureScene(scene, english) : renderLogisticsScene(scene, english);
  return `<div class="tactical-scene-backdrop" role="dialog" aria-modal="true" aria-labelledby="tactical-scene-title">
    <section class="action-scene action-scene-${scene.kind}">${content}
      <button id="tactical-scene-skip" class="action-scene-skip" type="button">${english ? 'Skip scene' : '演出をスキップ'}</button>
    </section>
  </div>`;
}
