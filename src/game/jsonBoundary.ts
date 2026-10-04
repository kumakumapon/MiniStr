import type { GameResult } from "./types";

/** Inspect iteratively before migrations or cloning can consume the JS stack. */
export function hasSafeJsonStructure(
  value: unknown,
  maxDepth = 64,
  maxNodes = 200_000,
): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > maxNodes || item.depth > maxDepth) return false;
    if (item.value && typeof item.value === "object") {
      for (const child of Object.values(item.value))
        pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  return true;
}

export function parseBoundedJson(
  text: string,
  maxBytes = 1_000_000,
): GameResult<unknown> {
  if (
    text.length > maxBytes ||
    new TextEncoder().encode(text).byteLength > maxBytes
  )
    return { ok: false, error: "JSONデータが大きすぎます。" };
  try {
    const value: unknown = JSON.parse(text);
    return hasSafeJsonStructure(value)
      ? { ok: true, value }
      : {
          ok: false,
          error: "JSONデータの深さまたは項目数が上限を超えています。",
        };
  } catch {
    return { ok: false, error: "JSONデータが壊れています。" };
  }
}
