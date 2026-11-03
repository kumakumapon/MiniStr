import { afterEach, expect, it, vi } from 'vitest';
import { createStorageWriter, renderStorageWriterNotice, STORAGE_WRITER_LOCK, StorageWriter, type StorageLockManager } from './storageWriter';
import { createBrowserStorage } from './storage';
import { setLocale } from './locale';

class Locks implements StorageLockManager {
  held = false;
  async request(name: string, options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: object | null) => Promise<void>): Promise<void> {
    expect(name).toBe(STORAGE_WRITER_LOCK);
    expect(options).toEqual({ mode: 'exclusive', ifAvailable: true });
    if (this.held) {
      await callback(null);
      return;
    }
    this.held = true;
    try {
      await callback({});
    } finally {
      this.held = false;
    }
  }
}
afterEach(() => {
  localStorage.clear();
  setLocale('ja');
});

it('holds one exclusive writer across multi-key writes until release, then permits retry', async () => {
  const locks = new Locks(),
    first = new StorageWriter(locks),
    second = new StorageWriter(locks);
  first.acquire();
  first.acquire();
  second.acquire();
  expect(first.writable).toBe(true);
  expect(second.state).toBe('busy');
  const storage = createBrowserStorage(
    () => localStorage,
    () => first.writable,
  );
  storage.setItem('ministr.a', 'one');
  storage.setItem('ministr.b', 'two');
  expect(locks.held).toBe(true);
  first.release();
  await vi.waitFor(() => expect(locks.held).toBe(false));
  second.acquire();
  expect(second.writable).toBe(true);
  second.release();
});

it('blocks writes and deletions without changing either snapshot when no lease is held', () => {
  localStorage.setItem('ministr.a', 'original');
  let owned = false;
  const storage = createBrowserStorage(
    () => localStorage,
    () => owned,
  );
  expect(() => storage.setItem('ministr.a', 'stale')).toThrow('Saving is not available');
  expect(() => storage.removeItem('ministr.a')).toThrow('Saving is not available');
  expect(storage.getItem('ministr.a')).toBe('original');
  expect(localStorage.getItem('ministr.a')).toBe('original');
  expect(storage.conflicted).toBe(false);
  owned = true;
  storage.setItem('ministr.a', 'mine');
  owned = false;
  expect(() => storage.removeItem('ministr.a')).toThrow();
  expect(storage.getItem('ministr.a')).toBe('mine');
});

it('still rejects a stale snapshot after its writer lease becomes available', () => {
  const storage = createBrowserStorage(
    () => localStorage,
    () => true,
  );
  localStorage.setItem('ministr.a', 'other');
  expect(() => storage.setItem('ministr.a', 'stale')).toThrow('Storage changed');
  expect(storage.conflicted).toBe(true);
  expect(localStorage.getItem('ministr.a')).toBe('other');
});

it('ignores late grants after pagehide and does not start duplicate pending requests', async () => {
  let grant: ((lock: object | null) => Promise<void>) | undefined;
  const request = vi.fn((_name, _options, callback) => {
    grant = callback;
    return Promise.resolve();
  });
  const writer = new StorageWriter({ request });
  writer.acquire();
  writer.acquire();
  expect(request).toHaveBeenCalledTimes(1);
  expect(writer.writable).toBe(false);
  writer.release();
  await grant!({});
  expect(writer.state).toBe('released');
  expect(writer.writable).toBe(false);
});

it('fails closed on synchronous or asynchronous API errors and can retry', async () => {
  const request: StorageLockManager['request'] = vi
    .fn()
    .mockImplementationOnce(() => {
      throw Error('denied');
    })
    .mockRejectedValueOnce(Error('denied'))
    .mockImplementationOnce((_name, _options, callback) => callback({}));
  const writer = new StorageWriter({ request });
  writer.acquire();
  expect(writer.state).toBe('failed');
  writer.acquire();
  await vi.waitFor(() => expect(writer.state).toBe('failed'));
  writer.acquire();
  expect(writer.state).toBe('owned');
  writer.release();
  writer.release();
});

it('fails closed on missing or inaccessible APIs, including return from pagehide', () => {
  for (const writer of [
    createStorageWriter(() => undefined),
    createStorageWriter(() => {
      throw Error('SecurityError');
    }),
  ]) {
    writer.acquire();
    expect(writer.state).toBe('unsupported');
    expect(writer.writable).toBe(false);
    writer.release();
    writer.acquire();
    expect(writer.state).toBe('unsupported');
  }
});

it('keeps the explicit memory-only fallback usable when browser storage is unavailable', () => {
  const storage = createBrowserStorage(
    () => {
      throw Error('SecurityError');
    },
    () => false,
  );
  storage.setItem('ministr.a', 'memory');
  expect(storage.getItem('ministr.a')).toBe('memory');
  storage.removeItem('ministr.a');
  expect(storage.getItem('ministr.a')).toBeNull();
});

it('leaves the snapshot intact on quota failures while holding a lease', () => {
  localStorage.setItem('ministr.a', 'original');
  const storage = createBrowserStorage(
    () => localStorage,
    () => true,
  );
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('QuotaExceededError');
  });
  try {
    expect(() => storage.setItem('ministr.a', 'new')).toThrow();
    expect(storage.getItem('ministr.a')).toBe('original');
  } finally {
    set.mockRestore();
  }
  expect(localStorage.getItem('ministr.a')).toBe('original');
});

it('renders truthful saving status and recovery controls in both languages', () => {
  for (const locale of ['ja', 'en'] as const) {
    setLocale(locale);
    expect(renderStorageWriterNotice('owned')).toBe('');
    for (const state of ['pending', 'busy', 'unsupported', 'released', 'failed'] as const) {
      document.body.innerHTML = renderStorageWriterNotice(state);
      expect(document.querySelector('[role="status"]')).not.toBeNull();
      expect(!!document.querySelector('[data-storage-write-export]')).toBe(state !== 'pending');
      expect(!!document.querySelector('[data-storage-write-retry]')).toBe(state !== 'pending' && state !== 'unsupported');
      if (locale === 'en') expect(document.body.textContent).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
    }
  }
});
