import { unitTokens } from './labels';
import { observeFourArmy, type FourArmyMap, type FourArmyState, type FourArmyUnit } from '../game/fourArmyEngine';
import type { FourArmyView } from '../game/fourArmySpectatorSave';
import type { Position, PlayerState } from '../game/types';
import type { FourArmyId } from '../game/fourArmyFoundation';

export const fourArmyColors: Record<FourArmyId, string> = { army1: '#ef8b7b', army2: '#83bdf4', army3: '#83d6ad', army4: '#f0cf79' };
export interface FourArmyDisplay {
  board: FourArmyMap['board'];
  units: FourArmyUnit[];
  visible?: ReadonlySet<string>;
  players: Partial<Record<FourArmyId, PlayerState>>;
}
export function fourArmyDisplay(state: FourArmyState, view: FourArmyView): FourArmyDisplay {
  if (view === 'all') return { board: state.board, units: state.units, players: state.players };
  const o = observeFourArmy(state, view);
  if (!o.ok) throw Error(o.error);
  return { board: o.value.board, units: o.value.units, players: { [view]: o.value.player }, visible: new Set(o.value.visible.map((p) => `${p.x},${p.y}`)) };
}
const terrainColors: Record<string, string> = {
  plain: '#719267',
  road: '#b2aa83',
  forest: '#3c6650',
  mountain: '#97977e',
  sea: '#427b92',
  swamp: '#667957',
  capital: '#839277',
  city: '#b1a48b',
  factory: '#a4aa9c',
  airport: '#9caead',
  port: '#8aa4ac',
  supplyDepot: '#89945f',
};
/** Canvas is visual only; the adjacent DOM summary and keyboard selection carry the same visible information. */
export function paintFourArmyBoard(
  canvas: HTMLCanvasElement,
  display: FourArmyDisplay,
  selected: Position,
  cell: number,
  targets: readonly Position[] = [],
  showUnitTypes = false,
): void {
  const size = cell * display.board.width,
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
  }
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  display.board.terrain.forEach((row, y) =>
    row.forEach((tile, x) => {
      const px = x * cell,
        py = y * cell,
        seen = !display.visible || display.visible.has(`${x},${y}`);
      c.fillStyle = seen ? (terrainColors[tile.kind] ?? terrainColors.plain!) : '#253d35';
      c.fillRect(px, py, cell, cell);
      c.strokeStyle = '#18392e44';
      c.lineWidth = 0.5;
      c.strokeRect(px, py, cell, cell);
      if (tile.kind === 'forest' && seen) {
        c.fillStyle = '#234a39';
        c.beginPath();
        c.moveTo(px + cell * 0.2, py + cell * 0.8);
        c.lineTo(px + cell * 0.5, py + cell * 0.2);
        c.lineTo(px + cell * 0.8, py + cell * 0.8);
        c.fill();
      }
      if (['capital', 'factory', 'airport', 'city', 'port', 'supplyDepot'].includes(tile.kind)) {
        c.fillStyle = tile.owner ? fourArmyColors[tile.owner] : '#e3dfc5';
        c.fillRect(px + cell * 0.15, py + cell * 0.15, cell * 0.7, cell * 0.7);
        if (cell >= 14) {
          c.fillStyle = '#162b23';
          c.font = `bold ${Math.floor(cell * 0.55)}px sans-serif`;
          c.textAlign = 'center';
          c.fillText(tile.kind === 'capital' ? '⚑' : tile.kind === 'factory' ? 'F' : tile.kind === 'airport' ? 'A' : '•', px + cell * 0.5, py + cell * 0.71);
        }
      }
    }),
  );
  for (const u of display.units) {
    if (!u.position) continue;
    const x = (u.position.x + 0.5) * cell,
      y = (u.position.y + 0.5) * cell;
    c.fillStyle = fourArmyColors[u.owner];
    c.strokeStyle = '#142b23';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, y, cell * 0.4, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#102b20';
    c.font = `bold ${Math.max(8, Math.floor(cell * 0.6))}px sans-serif`;
    c.textAlign = 'center';
    c.fillText(showUnitTypes ? unitTokens[u.kind] : u.owner.slice(-1), x, y + cell * 0.21, cell * 0.76);
    if (cell >= 16) {
      c.fillStyle = '#182c24';
      c.fillRect(x - cell * 0.4, y + cell * 0.36, cell * 0.8, 2);
      c.fillStyle = '#fff6d7';
      c.fillRect(x - cell * 0.4, y + cell * 0.36, (cell * 0.8 * u.hp) / 100, 2);
    }
  }
  c.strokeStyle = '#7ee8ff';
  c.lineWidth = 2;
  for (const p of targets) c.strokeRect(p.x * cell + 2, p.y * cell + 2, cell - 4, cell - 4);
  c.strokeStyle = '#fff5b7';
  c.lineWidth = 2;
  c.strokeRect(selected.x * cell + 1, selected.y * cell + 1, cell - 2, cell - 2);
}
