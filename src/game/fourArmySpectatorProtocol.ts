import { isFourArmySpectatorEnvelope, parseFourArmySpectatorSave, serializeFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import type { GameResult } from './types';
export type FourArmyFileRequest = { id: number; action: 'decode'; text: string } | { id: number; action: 'encode'; value: FourArmySpectatorSave };
export function handleFourArmyFileRequest(input: unknown): { id: number; result: GameResult<string> } | undefined {
  if (!input || typeof input !== 'object' || !('id' in input) || !Number.isSafeInteger(input.id) || (input.id as number) < 1) return;
  const id = input.id as number;
  if ('action' in input && input.action === 'decode' && 'text' in input && typeof input.text === 'string') {
    const r = parseFourArmySpectatorSave(input.text);
    return { id, result: r.ok ? { ok: true, value: input.text } : r };
  }
  if ('action' in input && input.action === 'encode' && 'value' in input && isFourArmySpectatorEnvelope(input.value))
    return { id, result: serializeFourArmySpectatorSave(input.value) };
  return { id, result: { ok: false, error: '4軍ファイルの要求が不正です。' } };
}
