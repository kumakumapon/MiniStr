import type { FourArmyCommand, FourArmyObservation } from '../game/fourArmyEngine';
import type { Position } from '../game/types';

/** Public home-relative coordinates keep equal-score choices independent of compass direction and unit identifiers. */
export function fourArmyCpuOrder(o: FourArmyObservation) {
  const { width, height } = o.board,
    home = o.capitals[o.viewer],
    right = home.x >= width / 2,
    bottom = home.y >= height / 2;
  const local = (p: Position): Position =>
    right ? (bottom ? { x: width - 1 - p.x, y: height - 1 - p.y } : { x: p.y, y: width - 1 - p.x }) : bottom ? { x: height - 1 - p.y, y: p.x } : p;
  const point = (p: Position) => {
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
