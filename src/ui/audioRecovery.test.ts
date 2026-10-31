import { describe, expect, it, vi } from 'vitest';
import { installAudioRecovery } from './audioRecovery';

describe('audio lifecycle recovery', () => {
  it('recovers on visibility, focus and BFCache return, ignores background events and removes listeners', async () => {
    const recover = vi.fn(async () => undefined);
    const denied = vi.fn(async () => {
      throw Error('autoplay');
    });
    const remove = installAudioRecovery([{ recover }, { recover: denied }]);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(recover).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    for (const event of ['focus', 'pageshow']) window.dispatchEvent(new Event(event));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(recover).toHaveBeenCalledTimes(3);
    expect(denied).toHaveBeenCalledTimes(3);
    remove();
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(recover).toHaveBeenCalledTimes(3);
    hidden.mockRestore();
  });
});
