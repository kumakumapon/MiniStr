import { smallBattlePositionRank } from '../game/smallBattle';
import type { FourArmyCommand, FourArmyObservation } from '../game/fourArmyEngine';
import type { Position } from '../game/types';
import type { FourArmyId } from '../game/fourArmyFoundation';

/** In three-way FFA, equal-distance home ties must not make both opponents pursue the same start. */
export function smallBattleFocus(o: FourArmyObservation): FourArmyId | undefined {
  if (o.match?.participants.length !== 3 || o.alive.length !== 3) return;
  const center = o.alive.reduce((p, a) => ({ x: p.x + o.capitals[a].x / 3, y: p.y + o.capitals[a].y / 3 }), { x: 0, y: 0 });
  const ring = [...o.alive].sort(
    (a, b) =>
      Math.atan2(o.capitals[a].y - center.y, o.capitals[a].x - center.x) - Math.atan2(o.capitals[b].y - center.y, o.capitals[b].x - center.x) ||
      o.capitals[a].x - o.capitals[b].x ||
      o.capitals[a].y - o.capitals[b].y,
  );
  return ring[(ring.indexOf(o.viewer) + 1) % ring.length];
}

/** Public home-relative coordinates keep equal-score choices independent of compass direction and unit identifiers. */
export function fourArmyCpuOrder(o: FourArmyObservation) {
  const { width, height } = o.board,
    home = o.capitals[o.viewer],
    right = home.x >= width / 2,
    bottom = home.y >= height / 2;
  const local = (p: Position): Position =>
    right ? (bottom ? { x: width - 1 - p.x, y: height - 1 - p.y } : { x: p.y, y: width - 1 - p.x }) : bottom ? { x: height - 1 - p.y, y: p.x } : p;
  const point = (p: Position) => {
    if (o.match) return smallBattlePositionRank(o.board, home, p, o.match.participants.length === 3);
    const q = local(p);
    return q.y * 32 + q.x;
  };
  const unit = (id: string) => {
    const u = o.units.find((u) => u.id === id);
    return u?.position ? [point(u.position), u.kind] : [];
  };
  return {
    compare: (a: Position, b: Position) => point(a) - point(b),
    key: (c: FourArmyCommand) =>
      JSON.stringify([
        c.type,
        'unitId' in c ? unit(c.unitId) : [],
        'transportId' in c ? unit(c.transportId) : [],
        'targetId' in c ? unit(c.targetId) : [],
        'factory' in c ? point(c.factory) : -1,
        'destination' in c ? point(c.destination) : -1,
        'kind' in c ? c.kind : '',
        'weaponSlot' in c ? c.weaponSlot : -1,
      ]),
  };
}
