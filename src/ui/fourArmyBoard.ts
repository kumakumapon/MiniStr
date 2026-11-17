import type { FourArmyFortification } from '../game/fourArmyRules';
import { observeFourArmy, type FourArmyMap, type FourArmyState, type FourArmyUnit } from '../game/fourArmyEngine';
import type { FourArmyView } from '../game/fourArmySpectatorSave';
import type { PlayerState } from '../game/types';
import type { FourArmyId } from '../game/fourArmyFoundation';

export interface FourArmyDisplay {
  board: FourArmyMap['board'];
  units: FourArmyUnit[];
  visible?: ReadonlySet<string>;
  players: Partial<Record<FourArmyId, PlayerState>>;
  fortifications?: FourArmyFortification[];
  bridges?: FourArmyState['bridges'];
}
export function fourArmyDisplay(state: FourArmyState, view: FourArmyView): FourArmyDisplay {
  if (view === 'all') return { board: state.board, units: state.units, players: state.players, fortifications: state.extensions?.fortifications, bridges: state.bridges };
  const o = observeFourArmy(state, view);
  if (!o.ok) throw Error(o.error);
  return {
    fortifications: o.value.extensions?.fortifications,
    bridges: o.value.bridges,
    board: o.value.board,
    units: o.value.units,
    players: { [view]: o.value.player },
    visible: new Set(o.value.visible.map((p) => `${p.x},${p.y}`)),
  };
}
