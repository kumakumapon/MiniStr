import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { isFourArmyControllers, type FourArmyControllers } from './fourArmyControl';
import { fourArmyParticipants } from './smallBattle';
import type { FourArmyState } from './fourArmyEngine';
export interface FourArmyControlHistory {
  initial: FourArmyControllers;
  events: { at: number; army: FourArmyId; from: 'human' | 'cpu'; to: 'human' | 'cpu' }[];
}
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === keys.sort().join();
export function isFourArmyControlHistory(v: unknown, count: number): v is FourArmyControlHistory {
  return (
    exact(v, ['initial', 'events']) &&
    isFourArmyControllers(v.initial) &&
    Array.isArray(v.events) &&
    v.events.length <= 256 &&
    v.events.every(
      (e, i, events) =>
        exact(e, ['at', 'army', 'from', 'to']) &&
        Number.isSafeInteger(e.at) &&
        (e.at as number) >= 0 &&
        (e.at as number) <= count &&
        (i === 0 || (e.at as number) >= events[i - 1].at) &&
        FOUR_ARMY_IDS.includes(e.army as FourArmyId) &&
        ['human', 'cpu'].includes(String(e.from)) &&
        ['human', 'cpu'].includes(String(e.to)) &&
        e.from !== e.to,
    )
  );
}
/** Events are checked against replayed states, never the persisted final checkpoint. */
export function fourArmyControlVerifier(history: FourArmyControlHistory, final: FourArmyControllers) {
  const controls = structuredClone(history.initial);
  let index = 0,
    valid = true;
  return {
    visit(state: FourArmyState, at: number) {
      const ids = fourArmyParticipants(state);
      if (FOUR_ARMY_IDS.some((a) => !ids.includes(a) && controls[a] !== 'cpu')) valid = false;
      while (index < history.events.length && history.events[index]!.at === at) {
        const e = history.events[index++]!;
        if (!ids.includes(e.army) || !state.alive.includes(e.army) || state.outcome.type !== 'ongoing' || controls[e.army] !== e.from) valid = false;
        controls[e.army] = e.to;
      }
    },
    finish: () => valid && index === history.events.length && FOUR_ARMY_IDS.every((a) => controls[a] === final[a]),
  };
}
