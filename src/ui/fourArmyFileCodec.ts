import {
  isFourArmySpectatorEnvelope,
  type FourArmySpectatorSave,
  FOUR_ARMY_FILE_BYTES,
  FOUR_ARMY_COMMAND_LIMIT,
  FOUR_ARMY_CHECKPOINT_INTERVAL,
} from '../game/fourArmySpectatorSave';
import { isFourArmyState } from '../game/fourArmyEngine';
import { handleFourArmyFileRequestAsync, type FourArmyFileRequest, type FourArmyFileResult } from '../game/fourArmySpectatorProtocol';
import type { GameResult } from '../game/types';

/** Owns the trusted verifier Worker. Cancellation settles callers and terminates replay validation. */
export class FourArmyFileCodec {
  private generation = 0;
  private worker?: Worker;
  private settle?: (v: GameResult<FourArmyFileResult> | undefined) => void;
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
  run(value: string | FourArmySpectatorSave, progress?: (done: number, total: number) => void): Promise<GameResult<FourArmyFileResult> | undefined> {
    this.cancel();
    const id = this.generation,
      request: FourArmyFileRequest = typeof value === 'string' ? { id, action: 'decode', text: value } : { id, action: 'encode', value: structuredClone(value) };
    return new Promise((resolve) => {
      this.settle = resolve;
      const finish = (result: GameResult<FourArmyFileResult>) => {
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
      let lastProgress = -1;
      const accept = (reply: unknown) => {
        if (id !== this.generation) return;
        if (reply && typeof reply === 'object' && 'id' in reply && reply.id === id && 'kind' in reply && reply.kind === 'progress') {
          if (
            !('done' in reply) ||
            !('total' in reply) ||
            !Number.isInteger(reply.done) ||
            !Number.isInteger(reply.total) ||
            (reply.done as number) < lastProgress ||
            (reply.done as number) < 0 ||
            (reply.total as number) > FOUR_ARMY_COMMAND_LIMIT ||
            (reply.done as number) > (reply.total as number)
          )
            return finish({ ok: false, error: '4軍ファイルの進行状況が不正です。' });
          lastProgress = reply.done as number;
          progress?.(reply.done as number, reply.total as number);
          return;
        }
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
        if (r.ok !== true || !('value' in r) || !r.value || typeof r.value !== 'object') return finish({ ok: false, error: '4軍ファイルの応答が不正です。' });
        const v = r.value as Record<string, unknown>;
        if (
          typeof v.text !== 'string' ||
          v.text.length > FOUR_ARMY_FILE_BYTES ||
          (request.action === 'decode' && v.text !== request.text) ||
          !isFourArmySpectatorEnvelope(v.save) ||
          !Array.isArray(v.checkpoints) ||
          v.checkpoints.length > 33
        )
          return finish({ ok: false, error: '4軍ファイルの応答が不正です。' });
        const checkpoints = v.checkpoints;
        if (
          checkpoints.length !== Math.floor(v.save.archive.payload.commands.length / FOUR_ARMY_CHECKPOINT_INTERVAL) + 1 ||
          !checkpoints.every((p, i) => p && typeof p === 'object' && p.position === i * FOUR_ARMY_CHECKPOINT_INTERVAL && isFourArmyState(p.state))
        )
          return finish({ ok: false, error: '4軍ファイルのチェックポイントが不正です。' });
        // Only this owned verifier Worker derives checkpoints; files cannot provide them.
        finish({ ok: true, value: { text: v.text, save: v.save, checkpoints } });
      };
      try {
        this.worker = this.createWorker();
        this.worker.onmessage = (e) => accept(e.data);
        this.worker.onerror = () => finish({ ok: false, error: '4軍ファイルの検証に失敗しました。' });
        this.worker.postMessage(request);
      } catch {
        if (this.worker) return finish({ ok: false, error: '4軍ファイルを送信できません。' });
        void handleFourArmyFileRequestAsync(
          request,
          () => id === this.generation,
          (id, done, total) => accept({ id, kind: 'progress', done, total }),
        )
          .then((reply) => {
            if (reply) accept(reply);
          })
          .catch(() => finish({ ok: false, error: '4軍ファイルを確認できません。' }));
      }
    });
  }
}
