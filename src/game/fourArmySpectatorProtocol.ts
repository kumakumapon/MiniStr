import {
  encodeFourArmySpectatorSave,
  verifyFourArmySpectatorSave,
  verifyFourArmySpectatorSaveAsync,
  type FourArmySpectatorSave,
  type VerifiedFourArmySave,
} from './fourArmySpectatorSave';
import type { GameResult } from './types';
export type FourArmyFileRequest = { id: number; action: 'decode'; text: string } | { id: number; action: 'encode'; value: FourArmySpectatorSave };
export type FourArmyFileResult = VerifiedFourArmySave & { text: string };
function requestText(input: unknown): { id: number; text: GameResult<string> } | undefined {
  if (!input || typeof input !== 'object' || !('id' in input) || !Number.isSafeInteger(input.id) || (input.id as number) < 1) return;
  const id = input.id as number;
  if ('action' in input && input.action === 'decode' && 'text' in input && typeof input.text === 'string') return { id, text: { ok: true, value: input.text } };
  if ('action' in input && input.action === 'encode' && 'value' in input) return { id, text: encodeFourArmySpectatorSave(input.value as FourArmySpectatorSave) };
  return { id, text: { ok: false, error: '4軍ファイルの要求が不正です。' } };
}
export function handleFourArmyFileRequest(input: unknown): { id: number; result: GameResult<FourArmyFileResult> } | undefined {
  const request = requestText(input);
  if (!request) return;
  if (!request.text.ok) return { id: request.id, result: request.text };
  const verifier = verifyFourArmySpectatorSave(request.text.value);
  let next = verifier.next();
  while (!next.done) next = verifier.next();
  return { id: request.id, result: next.value.ok ? { ok: true, value: { ...next.value.value, text: request.text.value } } : next.value };
}
export async function handleFourArmyFileRequestAsync(
  input: unknown,
  current: () => boolean = () => true,
  progress?: (id: number, done: number, total: number) => void,
): Promise<ReturnType<typeof handleFourArmyFileRequest>> {
  const request = requestText(input);
  if (!request) return;
  if (!request.text.ok) return { id: request.id, result: request.text };
  const result = await verifyFourArmySpectatorSaveAsync(request.text.value, current, (done, total) => progress?.(request.id, done, total));
  return result ? { id: request.id, result: result.ok ? { ok: true, value: { ...result.value, text: request.text.value } } : result } : undefined;
}
