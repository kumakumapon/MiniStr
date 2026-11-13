import { chooseFourArmyCpuCommand, isFourArmyCpuOptions, type FourArmyCpuOptions } from './fourArmyCpu';
import { boundedInt, exactKeys, isFourArmyObservation, record } from './fourArmyObservation';
import type { FourArmyCommand, FourArmyObservation } from '../game/fourArmyEngine';
import { FOUR_ARMY_IDS, type FourArmyId } from '../game/fourArmyFoundation';
import { isFourArmyCpuVersion, type FourArmyCpuVersion } from './fourArmyCpuVersion';

export interface FourArmyCpuTicket {
  protocol: 1;
  id: number;
  generation: number;
  turn: { actor: FourArmyId; round: number; index: number };
}
export interface FourArmyCpuRequest extends FourArmyCpuTicket {
  observation: FourArmyObservation;
  options: FourArmyCpuOptions;
  cpuVersion?: FourArmyCpuVersion;
}
export type FourArmyCpuResponse = FourArmyCpuTicket & ({ kind: 'command'; command: FourArmyCommand } | { kind: 'error'; error: 'CPU planning failed' });
export function isFourArmyCpuTicket(v: unknown): v is FourArmyCpuTicket {
  if (!record(v) || v.protocol !== 1 || !boundedInt(v.id, 1) || !boundedInt(v.generation, 1) || !record(v.turn)) return false;
  return (
    exactKeys(v.turn, ['actor', 'round', 'index']) &&
    FOUR_ARMY_IDS.some((a) => a === (v.turn as Record<string, unknown>).actor) &&
    boundedInt(v.turn.round, 1, 1_000_000) &&
    boundedInt(v.turn.index, 0, 3)
  );
}
export function isFourArmyCpuRequest(v: unknown): v is FourArmyCpuRequest {
  if (
    !isFourArmyCpuTicket(v) ||
    !record(v) ||
    !exactKeys(v, ['protocol', 'id', 'generation', 'turn', 'observation', 'options'], ['cpuVersion']) ||
    (Object.hasOwn(v, 'cpuVersion') && !isFourArmyCpuVersion(v.cpuVersion)) ||
    !isFourArmyObservation(v.observation) ||
    !isFourArmyCpuOptions(v.options)
  )
    return false;
  const o = v.observation;
  return (
    o.outcome.type === 'ongoing' &&
    o.round.phase === 'active' &&
    o.viewer === v.turn.actor &&
    o.round.order[o.round.index] === o.viewer &&
    o.round.round === v.turn.round &&
    o.round.index === v.turn.index
  );
}

/** Shared by the real Worker and the bounded, cancellable fallback. Invalid input is never reflected. */
export function handleFourArmyCpuRequest(input: unknown): FourArmyCpuResponse | undefined {
  if (!isFourArmyCpuRequest(input)) return undefined;
  const ticket: FourArmyCpuTicket = { protocol: 1, id: input.id, generation: input.generation, turn: { ...input.turn } };
  try {
    // Unversioned protocol1 clients retain the original deterministic CPU.
    const command = chooseFourArmyCpuCommand(input.observation, input.options, input.cpuVersion ?? 'four-army-cpu-v1');
    return command ? { ...ticket, kind: 'command', command } : { ...ticket, kind: 'error', error: 'CPU planning failed' };
  } catch {
    return { ...ticket, kind: 'error', error: 'CPU planning failed' };
  }
}
