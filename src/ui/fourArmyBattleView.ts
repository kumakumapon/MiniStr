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
        !seen ? 'fog' : '',
        selected ? 'selected' : '',
        reachable.has(key) ? 'reachable' : '',
        attacks.has(key) ? 'four-attack-target' : '',
        threat?.attack.has(key) ? 'enemy-attack-zone' : '',
        threat?.movement.has(key) ? 'enemy-move-zone' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const label = `(${x + 1}, ${y + 1}) ${terrainNames[tile.kind]}${tile.owner ? ' · ' + fourArmyName(tile.owner) : ''}${!seen ? (getLocale() === 'en' ? ' · Unseen' : ' · 未索敵') : ''}${unit ? ' · ' + fourArmyName(unit.owner) + ' ' + unitNames[unit.kind] + ' HP ' + unit.hp : ''}`;
      const facility = facilities[tile.kind];
      const cargo = unit && display.units.find((u) => u.embarkedIn === unit.id);
      return `<button type="button" class="${classes}" data-x="${x}" data-y="${y}" tabindex="${focused.x === x && focused.y === y ? 0 : -1}" aria-label="${escapeHtml(label)}"${selected ? ' aria-pressed="true"' : ''}>${renderTerrainArt(tile.kind, 'temperate')}${facility ? `<span class="facility facility-${tile.kind} ${tile.owner ?? 'neutral'}" aria-hidden="true"><b>${facility}</b>${tile.owner ? `<small>${tile.owner.slice(-1)}</small>` : ''}</span>` : ''}${unit ? `<span class="unit unit-${unit.kind} ${unit.owner}${unit.hasActed ? ' four-unit-done' : ''}" aria-hidden="true"><span class="unit-art"></span><small>${unit.hp}</small><i class="unit-owner-marker">${unit.owner.slice(-1)}</i>${cargo ? `<i class="cargo-marker">${getLocale() === 'en' ? 'C' : '積'}</i>` : ''}</span>` : ''}</button>`;
    }),
  );
}
