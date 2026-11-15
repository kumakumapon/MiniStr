import { applyFourArmyCommand, type FourArmyCommand, type FourArmyState } from '../src/game/fourArmyEngine';

/** Exercise the same fallback as the live CPU session; rejection must not silently shorten a replay audit. */
export function compareFourArmyContinuation(original: FourArmyState, restored: FourArmyState, choose: (s: FourArmyState) => FourArmyCommand, limit = 64) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 128) throw Error('Invalid continuation budget');
  const equal = () => {
    if (JSON.stringify(original) !== JSON.stringify(restored)) throw Error('Restored state drift');
  };
  const commands: FourArmyCommand[] = [];
  let fallbacks = 0;
  equal();
  while (commands.length < limit && original.outcome.type === 'ongoing') {
    let a = choose(original),
      b = choose(restored);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('Restored CPU continuation drift');
    let na = applyFourArmyCommand(original, a),
      nb = applyFourArmyCommand(restored, b);
    if (na.ok !== nb.ok) throw Error('Restored command result drift');
    if (!na.ok) {
      const unitId = 'unitId' in a ? a.unitId : 'transportId' in a ? a.transportId : undefined;
      a = b = unitId ? { actor: a.actor, type: 'wait', unitId } : { actor: a.actor, type: 'endTurn' };
      na = applyFourArmyCommand(original, a);
      nb = applyFourArmyCommand(restored, b);
      fallbacks++;
    }
    if (!na.ok || !nb.ok) throw Error('Rejected continuation fallback');
    original = na.value;
    restored = nb.value;
    commands.push(a);
    equal();
  }
  return { original, restored, commands, fallbacks };
}
