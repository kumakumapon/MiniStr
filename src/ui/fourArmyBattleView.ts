import { armyEmblem } from './fourArmyEmblems';
import { experienceRank } from '../game/experience';
import { defenseStars, terrainRules } from '../game/terrain';
import type { ThreatPreview } from '../game/threat';
import type { FourArmyId } from '../game/fourArmyFoundation';
import type { Position } from '../game/types';
import type { FourArmyDisplay } from './fourArmyBoard';
import type { FourArmyHumanChoice } from './fourArmyHuman';
import { getLocale } from './locale';
import { terrainNames, unitNames } from './labels';
import { escapeHtml } from './strings';
import { renderTerrainArt } from './terrainAppearance';

export const fourArmyName = (army: FourArmyId): string => (getLocale() === 'en' ? `Army ${army.slice(-1)}` : `第${army.slice(-1)}軍`);
/** Number matching units within the displayed army. Unseen units never contribute to these labels. */
export function fourArmyUnitNames(units: FourArmyDisplay['units']): Map<string, string> {
  const groups = new Map<string, FourArmyDisplay['units']>();
  for (const unit of units) {
    const key = `${unit.owner}:${unit.kind}`;
    const group = groups.get(key);
    if (group) group.push(unit);
    else groups.set(key, [unit]);
  }
  const names = new Map<string, string>();
  for (const group of groups.values()) {
    group.forEach((unit, index) => names.set(unit.id, group.length === 1 ? unitNames[unit.kind] : `${unitNames[unit.kind]} ${index + 1}`));
  }
  return names;
}
const positionKey = (p: Position) => `${p.x},${p.y}`;
const facilities: Record<string, string> = { capital: '⚑', city: 'C', factory: 'F', airport: 'A', port: 'P', supplyDepot: 'S' };

/** Render only the supplied display: restricted views never receive unseen units. */
export function fourArmyBoardCells(
  display: FourArmyDisplay,
  focused: Position,
  source: Position | undefined,
  choices: readonly FourArmyHumanChoice[],
  action?: string,
  threat?: ThreatPreview,
  supply?: ReadonlySet<string>,
  theme: 'temperate' | 'desert' | 'snow' = 'temperate',
): string[] {
  const units = new Map(display.units.filter((u) => u.position).map((u) => [positionKey(u.position!), u]));
  const reachable = new Set(choices.filter((c) => c.action === (action ?? 'move') && c.target).map((c) => positionKey(c.target!)));
  const attacks = new Set(choices.filter((c) => c.action.startsWith('attack-') && c.target).map((c) => positionKey(c.target!)));
  return display.board.terrain.flatMap((row, y) =>
    row.map((tile, x) => {
      const key = `${x},${y}`,
        unit = units.get(key),
        seen = !display.visible || display.visible.has(key);
      const selected = source?.x === x && source.y === y;
      const classes = [
        'tile',
        tile.kind,
        supply?.has(key) ? 'supply-coverage' : '',
        !seen ? 'fog' : '',
        selected ? 'selected' : '',
        reachable.has(key) ? 'reachable' : '',
        attacks.has(key) ? 'four-attack-target' : '',
        threat?.attack.has(key) ? 'enemy-attack-zone' : '',
        threat?.movement.has(key) ? 'enemy-move-zone' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const bridge = display.bridges?.some((b) => b.position.x === x && b.position.y === y);
      const vertical =
        bridge &&
        [-1, 1].every((d) => {
          const bank = display.board.terrain[y + d]?.[x];
          return !!bank && Number.isFinite(terrainRules[bank.kind].movement.tank);
        });
      const label = `(${x + 1}, ${y + 1}) ${terrainNames[tile.kind]}${bridge ? (getLocale() === 'en' ? ' · Bridge' : ' · 橋') : ''}${tile.owner ? ' · ' + fourArmyName(tile.owner) : ''}${!seen ? (getLocale() === 'en' ? ' · Unseen' : ' · 未索敵') : ''}${unit ? ' · ' + fourArmyName(unit.owner) + ' ' + unitNames[unit.kind] + ' HP ' + unit.hp : ''}${seen ? ' · ' + (getLocale() === 'en' ? 'Defense ' : '防御 ') + defenseStars({ kind: tile.kind }) : ''}${seen && tile.capturePoints !== undefined ? ' · ' + (getLocale() === 'en' ? 'Capture remaining ' : '占領残値 ') + tile.capturePoints : ''}${reachable.has(key) ? (getLocale() === 'en' ? ' · Reachable' : ' · 移動可能') : ''}${attacks.has(key) ? (getLocale() === 'en' ? ' · Attack target' : ' · 攻撃対象') : ''}${threat?.attack.has(key) ? (getLocale() === 'en' ? ' · Danger' : ' · 危険域') : ''}${unit?.hasActed ? (getLocale() === 'en' ? ' · Acted' : ' · 行動済み') : ''}`;
      const fort = seen && display.fortifications?.some((site) => site.position.x === x && site.position.y === y);
      const rank = unit ? experienceRank(unit.experience) : 0;
      const facility = facilities[tile.kind];
      const cargo = unit && display.units.find((u) => u.embarkedIn === unit.id);
      return `<button type="button" class="${classes}" data-x="${x}" data-y="${y}" tabindex="${focused.x === x && focused.y === y ? 0 : -1}" aria-label="${escapeHtml(label)}"${selected ? ' aria-pressed="true"' : ''}>${renderTerrainArt(tile.kind, theme)}${bridge ? `<span class="bridge-marker${vertical ? ' vertical' : ''}" aria-hidden="true">═</span>` : ''}${fort ? '<span class="fortification-marker" aria-hidden="true">▣</span>' : ''}${facility ? `<span class="facility facility-${tile.kind} ${tile.owner ?? 'neutral'}" aria-hidden="true"><b>${facility}</b>${tile.owner ? `<small>${armyEmblem(tile.owner)}</small>` : ''}</span>` : ''}${unit ? `<span class="unit unit-${unit.kind} ${unit.owner}${unit.hasActed ? ' four-unit-done' : ''}" aria-hidden="true"><span class="unit-art"></span><small>${unit.hp}</small><i class="unit-owner-marker">${armyEmblem(unit.owner)}</i>${rank ? `<i class="unit-rank" aria-hidden="true">${'★'.repeat(rank)}</i>` : ''}${cargo ? `<i class="cargo-marker">${getLocale() === 'en' ? 'C' : '積'}</i>` : ''}</span>` : ''}</button>`;
    }),
  );
}
