import { isGameCommand, type GameCommand } from '../game/session';
import type { GameState, Position } from '../game/types';
import { unitKinds } from '../game/units';

/** Treat worker messages as external input, then reconstruct a canonical command. */
export function decodeCpuResponse(value: unknown, state: GameState): GameCommand {
  const invalid = (): never => {
    throw Error('Invalid CPU worker response');
  };
  if (!isGameCommand(value)) return invalid();
  const id = (received: string): string => state.units.find((unit) => unit.id === received)?.id ?? invalid();
  const position = (received: Position): Position => {
    if (
      typeof received.x !== 'number' ||
      typeof received.y !== 'number' ||
      !Number.isSafeInteger(received.x) ||
      !Number.isSafeInteger(received.y) ||
      received.x < 0 ||
      received.y < 0 ||
      received.x >= state.board.width ||
      received.y >= state.board.height
    )
      return invalid();
    // Numeric conversion also makes the trust boundary explicit to static analysis.
    return { x: Number(received.x), y: Number(received.y) };
  };
  switch (value.type) {
    case 'endTurn':
      return { type: 'endTurn' };
    case 'recon':
      return { type: 'recon', center: position(value.center) };
    case 'move':
      return { type: 'move', unitId: id(value.unitId), destination: position(value.destination) };
    case 'bridge':
      return { type: 'bridge', unitId: id(value.unitId), destination: position(value.destination) };
    case 'destroyBridge':
      return { type: 'destroyBridge', unitId: id(value.unitId), destination: position(value.destination) };
    case 'fortify':
      return { type: 'fortify', unitId: id(value.unitId) };
    case 'wait':
      return { type: 'wait', unitId: id(value.unitId) };
    case 'evacuate':
      return { type: 'evacuate', unitId: id(value.unitId) };
    case 'attack':
      return { type: 'attack', unitId: id(value.unitId), targetId: id(value.targetId), ...(value.weaponSlot === undefined ? {} : { weaponSlot: value.weaponSlot === 0 ? 0 : 1 }) };
    case 'merge':
      return { type: 'merge', unitId: id(value.unitId), targetId: id(value.targetId) };
    case 'capture':
      return { type: 'capture', unitId: id(value.unitId) };
    case 'produce':
      return { type: 'produce', factory: position(value.factory), kind: unitKinds.find((kind) => kind === value.kind) ?? invalid() };
    case 'embark':
      return { type: 'embark', unitId: id(value.unitId), transportId: id(value.transportId) };
    case 'disembark':
      return { type: 'disembark', transportId: id(value.transportId), destination: position(value.destination) };
  }
}
