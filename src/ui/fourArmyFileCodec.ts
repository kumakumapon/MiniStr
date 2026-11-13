import { isFourArmySpectatorEnvelope, type FourArmySpectatorSave, FOUR_ARMY_FILE_BYTES } from '../game/fourArmySpectatorSave';
import { handleFourArmyFileRequest, type FourArmyFileRequest } from '../game/fourArmySpectatorProtocol';
import { parseBoundedJson } from '../game/jsonBoundary';
import type { GameResult } from '../game/types';

/** Owns the trusted verifier Worker. Cancellation settles callers and terminates replay validation. */
export class FourArmyFileCodec {
  private generation = 0;
  private worker?: Worker;
  private settle?: (v: GameResult<{ text: string; save: FourArmySpectatorSave }> | undefined) => void;
  constructor(private createWorker: () => Worker = () => new Worker(new URL('./fourArmyFileWorker.ts', import.meta.url), { type: 'module' })) {}
  cancel(): void {
    this.generation++;
    const w = this.worker;
    this.worker = undefined;
    if (w) {
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
    }
    const done = this.settle;
    this.settle = undefined;
    done?.(undefined);
  }
  run(value: string | FourArmySpectatorSave): Promise<GameResult<{ text: string; save: FourArmySpectatorSave }> | undefined> {
    this.cancel();
    const id = this.generation,
      request: FourArmyFileRequest = typeof value === 'string' ? { id, action: 'decode', text: value } : { id, action: 'encode', value: structuredClone(value) };
    return new Promise((resolve) => {
      this.settle = resolve;
      const finish = (result: GameResult<{ text: string; save: FourArmySpectatorSave }>) => {
        if (id !== this.generation) return;
        this.settle = undefined;
        const w = this.worker;
        this.worker = undefined;
        if (w) {
          w.onmessage = null;
          w.onerror = null;
          w.terminate();
        }
        resolve(result);
      };
      const accept = (reply: unknown) => {
        if (id !== this.generation) return;
        if (
          !reply ||
          typeof reply !== 'object' ||
          !('id' in reply) ||
          reply.id !== id ||
          !('result' in reply) ||
          !reply.result ||
          typeof reply.result !== 'object' ||
          !('ok' in reply.result)
        )
          return finish({ ok: false, error: '4軍ファイルの応答が不正です。' });
        const r = reply.result;
        if (r.ok === false) return finish({ ok: false, error: 'error' in r && typeof r.error === 'string' ? r.error.slice(0, 300) : '4軍ファイルを確認できません。' });
        if (r.ok !== true || !('value' in r) || typeof r.value !== 'string' || (request.action === 'decode' && r.value !== request.text))
          return finish({ ok: false, error: '4軍ファイルの応答が不正です。' });
        // The owned Worker has verified the complete history. Inspect its DTO without replaying on the UI thread.
        const parsed = parseBoundedJson(r.value, FOUR_ARMY_FILE_BYTES);
        if (!parsed.ok || !isFourArmySpectatorEnvelope(parsed.value)) return finish({ ok: false, error: '4軍ファイルの応答が不正です。' });
        finish({ ok: true, value: { text: r.value, save: parsed.value } });
      };
      try {
        this.worker = this.createWorker();
        this.worker.onmessage = (e) => accept(e.data);
        this.worker.onerror = () => finish({ ok: false, error: '4軍ファイルの検証に失敗しました。' });
        this.worker.postMessage(request);
      } catch {
        if (this.worker) return finish({ ok: false, error: '4軍ファイルを送信できません。' });
        void Promise.resolve()
          .then(() => {
            if (id === this.generation) accept(handleFourArmyFileRequest(request));
          })
          .catch(() => finish({ ok: false, error: '4軍ファイルを確認できません。' }));
      }
    });
  }
}
