import type { GameCommand, GameState, PlayerId, Position, TerrainKind, UnitKind, WeaponKind } from '../game';
import { forecastCombat, isDeployedUnit, weaponsForUnit } from '../game';
import { unitNames, terrainNames, weaponNames } from './labels';
import { getLocale } from './locale';
import { escapeHtml } from './strings';

export const BATTLE_SCENE_DURATION_MS = 3_600;
/** One clock for CSS, sound effects and the skippable scene lifetime. */
export const BATTLE_SCENE_TIMING = {
  fire: 750,
  impact: 1_125,
  counterFire: 1_875,
  counterImpact: 2_250,
  result: 2_700,
} as const;

export interface BattleParticipant {
  kind: UnitKind;
  owner: PlayerId;
  position: Position;
  weapon?: WeaponKind;
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

  const forecast = forecastCombat(before, attackerBefore, defenderBefore, command.weaponSlot);
  const attackingWeapon = forecast.ok ? weaponsForUnit(attackerBefore.kind, before)[forecast.value.attackWeapon]?.kind : undefined;
  const counterWeapon =
    defenderAfter && forecast.ok && forecast.value.counterWeapon !== undefined ? weaponsForUnit(defenderBefore.kind, before)[forecast.value.counterWeapon]?.kind : undefined;
  return {
    attacker: {
      kind: attackerBefore.kind,
      weapon: attackingWeapon,
      owner: attackerBefore.owner,
      position: { ...attackerBefore.position },
      hpBefore: attackerBefore.hp,
      hpAfter: attackerAfter && isDeployedUnit(attackerAfter) ? attackerAfter.hp : 0,
    },
    defender: {
      kind: defenderBefore.kind,
      weapon: counterWeapon,
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
    ? {
        title: 'Engagement',
        attacker: 'ATTACKER',
        defender: 'DEFENDER',
        terrain: 'Terrain',
        hp: 'HP',
        noDamage: 'No damage',
        destroyed: 'DESTROYED',
        skip: 'Skip scene',
        red: 'RED TEAM',
        blue: 'BLUE TEAM',
        aim: 'TARGET LOCK',
        strike: 'STRIKE',
        counter: 'COUNTER',
        result: 'RESULT',
        complete: 'Engagement complete',
      }
    : {
        title: '戦闘発生',
        attacker: '攻撃側',
        defender: '防衛側',
        terrain: '戦場',
        hp: 'HP',
        noDamage: 'ダメージなし',
        destroyed: '撃破',
        skip: '演出をスキップ',
        red: '赤軍',
        blue: '青軍',
        aim: '照準',
        strike: '攻撃',
        counter: '反撃',
        result: '戦果',
        complete: '戦闘終了',
      };

  const combatant = (unit: BattleParticipant, role: 'attacker' | 'defender', incomingDamage: number): string => {
    const sideLabel = role === 'attacker' ? labels.attacker : labels.defender;
    const before = clampedHp(unit.hpBefore);
    const after = clampedHp(unit.hpAfter);
    const name = unitNames[unit.kind];
    const damageText = incomingDamage > 0 ? `−${Number(incomingDamage)} HP` : labels.noDamage;
    const result = after === 0 ? `<span class="battle-destroyed">${labels.destroyed}</span>` : '';
    const hitClass = incomingDamage > 0 ? ' battle-hit' : '';
    const fireClass = role === 'attacker' || scene.attacker.hpAfter < scene.attacker.hpBefore ? ' battle-firing' : '';
    return `<article class="battle-combatant battle-${role} battle-team-${unit.owner}${hitClass}${fireClass}${after === 0 ? ' battle-destroyed-unit' : ''}">
      <span class="battle-team-badge battle-team-badge-${unit.owner}">${unit.owner === 'red' ? '■' : '●'} ${unit.owner === 'red' ? labels.red : labels.blue}</span>
      <span class="battle-side-label">${sideLabel}</span>
      <div class="battle-unit-stage" aria-hidden="true">
        <span class="battle-target-lock"></span>
        <span class="unit battle-sprite ${unit.owner} unit-${unit.kind}"><span class="unit-art"></span></span>
        <span class="battle-impact-ring"></span>
      </div>
      <h3>${escapeHtml(name)}</h3>${unit.weapon ? `<p class="battle-weapon">${escapeHtml(weaponNames[unit.weapon])}</p>` : ''}
      <div class="battle-hp" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(after)}" aria-label="${escapeHtml(`${name} ${labels.hp} ${Number(after)}`)}">
        <span class="battle-hp-fill" style="--hp-before:${Number(before)}%;--hp-after:${Number(after)}%"></span>
      </div>
      <div class="battle-hp-label"><span>${labels.hp} ${Number(before)} → ${Number(after)}</span><strong>${damageText}</strong></div>
      ${result}
    </article>`;
  };

  const hasCounter = scene.attacker.hpAfter < scene.attacker.hpBefore;
  const counterClass = hasCounter ? ' has-counter' : '';
  const lostUnit = scene.defender.hpAfter === 0 ? scene.defender : scene.attacker.hpAfter === 0 ? scene.attacker : undefined;
  const summary = lostUnit ? (english ? `${unitNames[lostUnit.kind]} destroyed` : `${unitNames[lostUnit.kind]}を撃破`) : labels.complete;
  const timingStyle = Object.entries(BATTLE_SCENE_TIMING)
    .map(([key, value]) => `--battle-${key}:${value}ms`)
    .join(';');
  return `<div class="battle-scene-backdrop" role="dialog" aria-modal="true" aria-labelledby="battle-scene-title">
    <section class="battle-scene battle-terrain-${scene.terrain}${counterClass}" style="${timingStyle};--battle-duration:${Number(BATTLE_SCENE_DURATION_MS)}ms">
      <header class="battle-scene-header">
        <div><p class="card-kicker">TACTICAL ENGAGEMENT</p><h2 id="battle-scene-title">${labels.title}</h2></div>
        <span class="battle-scene-terrain">${labels.terrain} · ${escapeHtml(terrainNames[scene.terrain])}</span>
      </header>
      <div class="battle-phase-rail" aria-hidden="true">
        <span class="battle-phase-aim">01 · ${labels.aim}</span><span class="battle-phase-strike">02 · ${labels.strike}</span>
        ${hasCounter ? `<span class="battle-phase-counter">03 · ${labels.counter}</span>` : ''}<span class="battle-phase-result">${hasCounter ? '04' : '03'} · ${labels.result}</span>
      </div>
      <div class="battle-scene-arena">
        ${combatant(scene.attacker, 'attacker', scene.attacker.hpBefore - scene.attacker.hpAfter)}
        <span class="battle-scene-versus" aria-hidden="true">VS</span>
        ${combatant(scene.defender, 'defender', scene.defender.hpBefore - scene.defender.hpAfter)}
        <span class="battle-projectile battle-projectile-attack battle-weapon-${scene.attacker.weapon ?? 'cannon'}" aria-hidden="true"></span>
        ${hasCounter ? `<span class="battle-projectile battle-projectile-counter battle-weapon-${scene.defender.weapon ?? 'cannon'}" aria-hidden="true"></span>` : ''}
      </div>
      ${hasCounter ? `<p class="battle-counter-note">${english ? 'Counterattack' : '反撃'} · −${scene.attacker.hpBefore - scene.attacker.hpAfter} HP</p>` : ''}
      <p class="battle-result"><span>${labels.result}</span><strong>${escapeHtml(summary)}</strong></p>
      <button id="battle-scene-skip" class="battle-scene-skip" type="button">${labels.skip}</button>
    </section>
  </div>`;
}
