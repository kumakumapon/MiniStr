import type { StorageLike } from '../game/session';

/** A coherent tab-local snapshot. Never absorb another tab's partially written data. */
export function createBrowserStorage(provider: () => Storage): StorageLike & {
  readonly persistent: boolean;
  readonly conflicted: boolean;
  markExternalChange(): void;
  checkForChanges(): boolean;
} {
  const memory = new Map<string, string>();
  let backend: Storage | undefined;
  let conflicted = false;
  try {
    backend = provider();
    for (let i = 0; i < backend.length; i++) {
      const key = backend.key(i);
      if (key?.startsWith('ministr.')) {
        const value = backend.getItem(key);
        if (value !== null) memory.set(key, value);
      }
    }
  } catch {
    backend = undefined;
  }
  const assertWritable = (key: string): void => {
    // Storage events are asynchronous: also compare immediately before a write.
    if (backend) {
      const keys = new Set([...memory.keys(), key]);
      for (let i = 0; i < backend.length; i++) {
        const storedKey = backend.key(i);
        if (storedKey?.startsWith('ministr.')) keys.add(storedKey);
      }
      for (const storedKey of keys)
        if (backend.getItem(storedKey) !== (memory.get(storedKey) ?? null)) {
          conflicted = true;
          break;
        }
    }
    if (conflicted) throw Error('Storage changed in another tab; reload before writing');
  };
  return {
    get persistent() {
      return backend !== undefined;
    },
    get conflicted() {
      return conflicted;
    },
    markExternalChange() {
      conflicted = true;
    },
    checkForChanges() {
      if (!backend || conflicted) return conflicted;
      try {
        const keys = new Set(memory.keys());
        for (let i = 0; i < backend.length; i++) {
          const key = backend.key(i);
          if (key?.startsWith('ministr.')) keys.add(key);
        }
        for (const key of keys)
          if (backend.getItem(key) !== (memory.get(key) ?? null)) {
            conflicted = true;
            break;
          }
      } catch {
        backend = undefined;
      }
      return conflicted;
    },
    get length() {
      return memory.size;
    },
    key(index) {
      return [...memory.keys()][index] ?? null;
    },
    getItem(key) {
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      assertWritable(key);
      // Quota errors must reach transactional callers; keep the previous snapshot.
      backend?.setItem(key, value);
      memory.set(key, value);
    },
    removeItem(key) {
      assertWritable(key);
      backend?.removeItem(key);
      memory.delete(key);
    },
  };
}
