import type { GameCommand, GameState, PlayerId, Position, TerrainKind, UnitKind } from '../game';
import { isDeployedUnit } from '../game';
import { unitNames, terrainNames } from './labels';
import { getLocale } from './locale';
import { escapeHtml } from './strings';

export const BATTLE_SCENE_DURATION_MS = 2_050;

export interface BattleParticipant {
  kind: UnitKind;
  owner: PlayerId;
  position: Position;
  hpBefore: number;
  hpAfter: number;
}

export interface BattleScene {
  attacker: BattleParticipant;
  defender: BattleParticipant;
  terrain: TerrainKind;
}

/** Creates a visual summary from resolved combat, leaving all game rules untouched. */
export function battleSceneForCommand(before: GameState, command: GameCommand, after: GameState): BattleScene | undefined {
  if (command.type !== 'attack') return undefined;
  const attackerBefore = before.units.find((unit) => unit.id === command.unitId);
  const defenderBefore = before.units.find((unit) => unit.id === command.targetId);
  if (!attackerBefore || !isDeployedUnit(attackerBefore) || !defenderBefore || !isDeployedUnit(defenderBefore)) return undefined;

  const attackerAfter = after.units.find((unit) => unit.id === command.unitId);
  const defenderAfter = after.units.find((unit) => unit.id === command.targetId);
  const terrain = before.board.terrain[defenderBefore.position.y]?.[defenderBefore.position.x];
  if (!terrain) return undefined;

  return {
    attacker: {
      kind: attackerBefore.kind,
      owner: attackerBefore.owner,
      position: { ...attackerBefore.position },
      hpBefore: attackerBefore.hp,
      hpAfter: attackerAfter && isDeployedUnit(attackerAfter) ? attackerAfter.hp : 0,
    },
    defender: {
      kind: defenderBefore.kind,
      owner: defenderBefore.owner,
      position: { ...defenderBefore.position },
      hpBefore: defenderBefore.hp,
      hpAfter: defenderAfter && isDeployedUnit(defenderAfter) ? defenderAfter.hp : 0,
    },
    terrain: terrain.kind,
  };
}

function clampedHp(hp: number): number {
  return Math.max(0, Math.min(100, Math.round(hp)));
}

/** A modal, skippable combat tableau using the same unit sprites as the map. */
export function renderBattleScene(scene: BattleScene): string {
  const english = getLocale() === 'en';
  const labels = english
    ? { title: 'Engagement', attacker: 'ATTACKER', defender: 'DEFENDER', terrain: 'Terrain', hp: 'HP', noDamage: 'No damage', destroyed: 'DESTROYED', skip: 'Skip scene' }
    : { title: '戦闘発生', attacker: '攻撃側', defender: '防衛側', terrain: '戦場', hp: 'HP', noDamage: 'ダメージなし', destroyed: '撃破', skip: '演出をスキップ' };

  const combatant = (unit: BattleParticipant, role: 'attacker' | 'defender', incomingDamage: number): string => {
    const sideLabel = role === 'attacker' ? labels.attacker : labels.defender;
    const before = clampedHp(unit.hpBefore);
    const after = clampedHp(unit.hpAfter);
    const name = unitNames[unit.kind];
    const damageText = incomingDamage > 0 ? `−${incomingDamage} HP` : labels.noDamage;
    const result = after === 0 ? `<span class="battle-destroyed">${labels.destroyed}</span>` : '';
    const hitClass = incomingDamage > 0 ? ' battle-hit' : '';
    return `<article class="battle-combatant battle-${role}${hitClass}">
      <span class="battle-side-label">${sideLabel}</span>
      <span class="unit battle-sprite ${unit.owner} unit-${unit.kind}" aria-hidden="true"><span class="unit-art"></span></span>
      <h3>${escapeHtml(name)}</h3>
      <div class="battle-hp" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${after}" aria-label="${escapeHtml(`${name} ${labels.hp} ${after}`)}">
        <span class="battle-hp-fill" style="--hp-before:${before}%;--hp-after:${after}%"></span>
      </div>
      <div class="battle-hp-label"><span>${labels.hp} ${before} → ${after}</span><strong>${damageText}</strong></div>
      ${result}
    </article>`;
  };

  const counterClass = scene.attacker.hpAfter < scene.attacker.hpBefore ? ' has-counter' : '';
  return `<div class="battle-scene-backdrop" role="dialog" aria-modal="true" aria-labelledby="battle-scene-title">
    <section class="battle-scene${counterClass}">
      <header class="battle-scene-header">
        <div><p class="card-kicker">TACTICAL ENGAGEMENT</p><h2 id="battle-scene-title">${labels.title}</h2></div>
        <span class="battle-scene-terrain">${labels.terrain} · ${escapeHtml(terrainNames[scene.terrain])}</span>
      </header>
      <div class="battle-scene-arena">
        ${combatant(scene.attacker, 'attacker', scene.attacker.hpBefore - scene.attacker.hpAfter)}
        <span class="battle-scene-versus" aria-hidden="true">VS</span>
        ${combatant(scene.defender, 'defender', scene.defender.hpBefore - scene.defender.hpAfter)}
      </div>
      ${scene.attacker.hpAfter < scene.attacker.hpBefore ? `<p class="battle-counter-note">${english ? 'Counterattack' : '反撃'} · −${scene.attacker.hpBefore - scene.attacker.hpAfter} HP</p>` : ''}
      <button id="battle-scene-skip" class="battle-scene-skip" type="button">${labels.skip}</button>
    </section>
  </div>`;
}
