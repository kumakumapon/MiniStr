import type { StorageLike } from "../game/session";

/** Capture a throwing browser getter and keep a coherent session-only copy. */
export function createBrowserStorage(provider: () => Storage): StorageLike & {
  readonly persistent: boolean;
  readonly conflicted: boolean;
  markExternalChange(): void;
} {
  const memory = new Map<string, string>();
  let backend: Storage | undefined;
  let conflicted = false;
  try {
    backend = provider();
    for (let i = 0; i < backend.length; i++) {
      const key = backend.key(i);
      if (key?.startsWith("ministr.")) memory.set(key, backend.getItem(key)!);
    }
  } catch {
    backend = undefined;
  }
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
    get length() {
      try {
        return backend?.length ?? memory.size;
      } catch {
        backend = undefined;
        return memory.size;
      }
    },
    key(index) {
      try {
        return backend
          ? backend.key(index)
          : ([...memory.keys()][index] ?? null);
      } catch {
        backend = undefined;
        return [...memory.keys()][index] ?? null;
      }
    },
    getItem(key) {
      if (backend) {
        try {
          const value = backend.getItem(key);
          if (value === null) memory.delete(key);
          else memory.set(key, value);
          return value;
        } catch {
          backend = undefined;
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      if (conflicted)
        throw Error("Storage changed in another tab; reload before writing");
      if (backend) {
        // Quota errors must reach transactional callers; do not claim persistence.
        backend.setItem(key, value);
      }
      memory.set(key, value);
    },
    removeItem(key) {
      if (conflicted)
        throw Error("Storage changed in another tab; reload before writing");
      backend?.removeItem(key);
      memory.delete(key);
    },
  };
}
