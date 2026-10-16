import { isDeployedUnit, remainingAmmo, unitStats, type GameState, type PlayerId, type Position } from '../game';
import { sideLabel, unitNames, unitWeaponName } from './labels';
import { escapeHtml, uiText } from './strings';

/** Selected units stay in view even while the player inspects a possible destination. */
export function renderUnitBrief(state: GameState, viewer: PlayerId, visible: ReadonlySet<string>, selectedId: string | undefined, focused: Position): string {
  const unit =
    state.units.find((unit) => unit.id === selectedId) ?? state.units.find((unit) => isDeployedUnit(unit) && unit.position.x === focused.x && unit.position.y === focused.y);
  const title = `<p class="unit-brief-kicker">${uiText.unitBriefTitle}</p>`;
  if (!unit || !isDeployedUnit(unit) || !visible.has(`${unit.position.x},${unit.position.y}`)) {
    return `<section id="unit-brief" class="unit-brief unit-brief-empty" aria-label="${uiText.unitBriefTitle}">${title}<p>${uiText.unitBriefPrompt}</p></section>`;
  }
  const stats = unitStats[unit.kind];
  const own = unit.owner === viewer;
  const ammo = stats.ammo === 0 ? uiText.unarmed : own ? `${remainingAmmo(unit)} / ${stats.ammo}` : uiText.unitBriefUnknown;
  const fuel = own ? `${unit.fuel ?? stats.fuel} / ${stats.fuel}` : uiText.unitBriefUnknown;
  const range = stats.range[0] === stats.range[1] ? `${stats.range[0]}` : stats.range.join('–');
  const status = own ? (unit.hasActed ? uiText.unitBriefDone : unit.hasMoved ? uiText.unitBriefMoved : uiText.unitBriefReady) : '';
  const empty = own && stats.ammo > 0 && remainingAmmo(unit) === 0;
  const rows: [string, string][] = [
    [uiText.unitBriefHp, `${unit.hp} / 100`],
    [uiText.ammo, ammo],
    [uiText.unitBriefFuel, fuel],
  ];
  return `<section id="unit-brief" class="unit-brief unit-brief-${unit.owner}" aria-label="${uiText.unitBriefTitle}" data-unit-id="${escapeHtml(unit.id)}">
    <div class="unit-brief-heading"><div>${title}<h3>${escapeHtml(sideLabel(unit.owner, viewer))} ${escapeHtml(unitNames[unit.kind])}</h3></div><span class="unit-brief-position">(${unit.position.x + 1}, ${unit.position.y + 1})${status ? ` · ${status}` : ''}</span></div>
    <p class="unit-brief-weapon">${escapeHtml(unitWeaponName(unit.kind))} · ${uiText.unitBriefRange} ${range} · ${uiText.unitBriefMovement} ${stats.movement}${empty ? ` <strong class="unit-brief-warning">${uiText.ammoEmpty}</strong>` : ''}</p>
    <dl class="unit-brief-stats">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
  </section>`;
}
