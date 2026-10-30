import { SUPPLY_CAPACITY, supplyStock, usesFiniteSupplyRules } from '../game';
import { supplyOutlook } from './frontline';
import { isDeployedUnit, hasUsableWeapon, remainingAmmo, weaponAmmo, weaponsForUnit, unitStats, type WeaponSlot, type GameState, type PlayerId, type Position } from '../game';
import { sideLabel, unitNames, unitWeaponName, weaponNames } from './labels';
import { getLocale } from './locale';
import { escapeHtml, uiText } from './strings';

/** Selected units stay in view even while the player inspects a possible destination. */
export function renderUnitBrief(
  state: GameState,
  viewer: PlayerId,
  visible: ReadonlySet<string>,
  selectedId: string | undefined,
  focused: Position,
  weaponSlot?: WeaponSlot,
  canSelectWeapon = false,
): string {
  const unit =
    state.units.find((unit) => unit.id === selectedId) ?? state.units.find((unit) => isDeployedUnit(unit) && unit.position.x === focused.x && unit.position.y === focused.y);
  const title = `<p class="unit-brief-kicker">${uiText.unitBriefTitle}</p>`;
  if (!unit || !isDeployedUnit(unit) || !visible.has(`${unit.position.x},${unit.position.y}`)) {
    return `<section id="unit-brief" class="unit-brief unit-brief-empty" aria-label="${uiText.unitBriefTitle}">${title}<p>${uiText.unitBriefPrompt}</p></section>`;
  }
  const stats = unitStats[unit.kind];
  const own = unit.owner === viewer;
  const weapons = weaponsForUnit(unit.kind, state);
  const english = getLocale() === 'en';
  const ammo = stats.ammo === 0 ? uiText.unarmed : own ? `${remainingAmmo(unit)} / ${stats.ammo}` : uiText.unitBriefUnknown;
  const fuel = own ? `${unit.fuel ?? stats.fuel} / ${stats.fuel}` : uiText.unitBriefUnknown;
  const range = stats.range[0] === stats.range[1] ? `${stats.range[0]}` : stats.range.join('–');
  const status = own ? (unit.hasActed ? uiText.unitBriefDone : unit.hasMoved ? uiText.unitBriefMoved : uiText.unitBriefReady) : '';
  const empty = own && weapons.length > 0 && !hasUsableWeapon(state, unit, false);
  const rows: [string, string][] = [
    [uiText.unitBriefHp, `${unit.hp} / 100`],
    [uiText.ammo, weapons.length > 1 && own ? weapons.map((weapon, slot) => `${weaponAmmo(unit, slot as WeaponSlot)} / ${weapon.ammo}`).join(' + ') : ammo],
    [uiText.unitBriefFuel, fuel],
  ];
  if (usesFiniteSupplyRules(state) && unit.kind === 'apc') rows.push([uiText.supplyStock, own ? `${supplyStock(unit)} / ${SUPPLY_CAPACITY}` : uiText.unitBriefUnknown]);
  return `<section id="unit-brief" class="unit-brief unit-brief-${escapeHtml(unit.owner)}" aria-label="${uiText.unitBriefTitle}" data-unit-id="${escapeHtml(unit.id)}">
    <div class="unit-brief-heading"><div>${title}<h3>${escapeHtml(sideLabel(unit.owner, viewer))} ${escapeHtml(unitNames[unit.kind])}${own && unit.callsign ? ` <span data-user-content>${escapeHtml(unit.callsign)}</span>` : ''}</h3></div><span class="unit-brief-position">(${Number(unit.position.x) + 1}, ${Number(unit.position.y) + 1})${status ? ` · ${status}` : ''}</span></div>
    <p class="unit-brief-weapon">${escapeHtml(unitWeaponName(unit.kind, state))} · ${uiText.unitBriefRange} ${range} · ${uiText.unitBriefMovement} ${stats.movement}${empty ? ` <strong class="unit-brief-warning">${uiText.ammoEmpty}</strong>` : ''}</p>
    ${weapons.length > 1 ? `<ul class="unit-brief-weapons">${weapons.map((weapon, slot) => `<li><strong>${escapeHtml(weaponNames[weapon.kind])}</strong> · ${english ? 'Power' : '威力'} ${weapon.attack} · ${uiText.unitBriefRange} ${weapon.range.join('–')} · ${uiText.ammo} ${own ? `${weaponAmmo(unit, slot as WeaponSlot)} / ${weapon.ammo}` : uiText.unitBriefUnknown}</li>`).join('')}</ul>` : ''}
    ${own && selectedId === unit.id && weapons.length > 1 && canSelectWeapon ? `<label class="unit-weapon-select">${english ? 'Attack weapon' : '攻撃武器'} <select id="attack-weapon" ${unit.hasActed ? 'disabled' : ''}><option value="auto"${weaponSlot === undefined ? ' selected' : ''}>${english ? 'Auto (strongest available)' : '自動（使用可能な武器の最大ダメージ）'}</option>${weapons.map((weapon, slot) => `<option value="${slot}"${weaponSlot === slot ? ' selected' : ''} ${weaponAmmo(unit, slot as WeaponSlot) === 0 || (weapon.indirect && unit.hasMoved) ? 'disabled' : ''}>${escapeHtml(weaponNames[weapon.kind])} · ${english ? 'Power' : '威力'} ${weapon.attack} · ${uiText.ammo} ${weaponAmmo(unit, slot as WeaponSlot)} / ${weapon.ammo}</option>`).join('')}</select></label>` : ''}
    ${own && supplyOutlook(state, unit) ? `<p class="supply-outlook">${escapeHtml(supplyOutlook(state, unit))}</p>` : ''}
    <dl class="unit-brief-stats">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
  </section>`;
}
