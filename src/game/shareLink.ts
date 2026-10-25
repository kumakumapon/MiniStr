import { GENERATED_SEAS, GENERATED_SEED_PATTERN, GENERATED_SIZES, type MapGenerationOptions } from './mapGenerator';
import type { GameResult } from './types';

/**
 * Share links carry only the conditions of a generated map in the URL hash:
 *
 *   #ministr-gen1/{gen}/{size}/{sea}/{preset}/{seed}
 *
 * `gen1` is the version of this link format; `{gen}` is the version of the
 * generation logic the conditions were made for. A version never changes
 * meaning once released: new generation logic gets a new link format
 * (`gen2`, ...) and the old one keeps rebuilding exactly the same map.
 *
 * The hash is external input. Everything is checked against allow-lists and
 * nothing is decoded: percent-encoding, case variants, extra or empty
 * segments and trailing separators are all rejected. Nothing here throws, and
 * no rejection message repeats the input.
 */
export const SHARE_LINK_FORMAT = 'ministr-gen1';
/** Every link format version starts with this, so a newer version is told apart from an unrelated hash. */
const SHARE_LINK_FAMILY = 'ministr-gen';
/** Longest accepted hash, without the leading `#`. The longest valid link is 58 characters. */
export const SHARE_HASH_MAX_LENGTH = 128;

/** Generation logic versions the `gen1` link format can name, and the preset each one means. */
export const SHARE_GEN1_GENERATIONS = {
  2: 'standard',
  3: 'frontline',
} as const satisfies Record<number, NonNullable<MapGenerationOptions['preset']>>;

export type ShareGeneration = keyof typeof SHARE_GEN1_GENERATIONS;
export type SharePreset = (typeof SHARE_GEN1_GENERATIONS)[ShareGeneration];

export interface GeneratedShare {
  gen: ShareGeneration;
  size: MapGenerationOptions['size'];
  sea: MapGenerationOptions['sea'];
  preset: SharePreset;
  seed: string;
}

export const shareMessages = {
  tooLong: '共有リンクが長すぎます。',
  malformed: '共有リンクの形式が正しくありません。',
  unsupportedFormat: 'この共有リンクの形式には対応していません。アプリが古い可能性があります。',
  unsupportedGeneration: 'この共有リンクの生成バージョンには対応していません。',
  invalidSize: '共有リンクのサイズが正しくありません。',
  invalidSea: '共有リンクの海域量が正しくありません。',
  invalidPreset: '共有リンクの戦域設定が正しくありません。',
  presetMismatch: '共有リンクの生成バージョンと戦域設定が一致しません。',
  invalidSeed: '共有リンクのseedが正しくありません。',
  dailySeed: '日替わり形式のseedは共有リンクにできません。',
  invalidOrigin: 'この環境では共有リンクを作成できません。',
  libraryFull: 'カスタム作戦の保存数が上限です。タイトル画面で既存のカスタム作戦を削除してから、もう一度お試しください。',
  unplayable: '共有リンクの戦域を生成できませんでした。',
} as const;

/** Day-by-day challenges own the `D<YYYYMMDD>` seeds; sharing them would leak the daily rules into custom maps. */
const DAILY_SEED = /^D\d{8}$/;

/**
 * True when the hash is meant as a share link (any link format version), so
 * unrelated hashes such as `#foo` are ignored without a message.
 */
export function isShareLinkCandidate(hash: string): boolean {
  return typeof hash === 'string' && hash.startsWith(`#${SHARE_LINK_FAMILY}`);
}

function fail<T>(error: string): GameResult<T> {
  return { ok: false, error };
}

/** Reads `location.hash`. Never throws; rejects anything that is not exactly a valid link. */
export function parseGeneratedShare(hash: unknown): GameResult<GeneratedShare> {
  if (typeof hash !== 'string') return fail(shareMessages.malformed);
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (body.length > SHARE_HASH_MAX_LENGTH) return fail(shareMessages.tooLong);
  const parts = body.split('/');
  const [format, gen, size, sea, preset, seed] = parts;
  if (format !== SHARE_LINK_FORMAT) return fail(format?.startsWith(SHARE_LINK_FAMILY) ? shareMessages.unsupportedFormat : shareMessages.malformed);
  if (parts.length !== 6 || parts.some((part) => part === '')) return fail(shareMessages.malformed);
  const generation = (Object.keys(SHARE_GEN1_GENERATIONS) as `${ShareGeneration}`[]).find((key) => key === gen);
  if (generation === undefined) return fail(shareMessages.unsupportedGeneration);
  const generatedSize = GENERATED_SIZES.find((candidate) => String(candidate) === size);
  if (generatedSize === undefined) return fail(shareMessages.invalidSize);
  const generatedSea = GENERATED_SEAS.find((candidate) => candidate === sea);
  if (generatedSea === undefined) return fail(shareMessages.invalidSea);
  if (preset !== 'standard' && preset !== 'frontline') return fail(shareMessages.invalidPreset);
  const gen1 = Number(generation) as ShareGeneration;
  if (SHARE_GEN1_GENERATIONS[gen1] !== preset) return fail(shareMessages.presetMismatch);
  if (seed === undefined || !GENERATED_SEED_PATTERN.test(seed)) return fail(shareMessages.invalidSeed);
  if (DAILY_SEED.test(seed)) return fail(shareMessages.dailySeed);
  return { ok: true, value: { gen: gen1, size: generatedSize, sea: generatedSea, preset, seed } };
}

/**
 * Builds the hash (with the leading `#`) for generator conditions. The result
 * is parsed again, so only links this app would accept are ever produced.
 */
export function serializeGeneratedShare(options: { size: number; sea: string; seed: string; preset?: string }): GameResult<string> {
  const preset = options.preset ?? 'standard';
  const gen = preset === 'frontline' ? 3 : preset === 'standard' ? 2 : undefined;
  if (gen === undefined) return fail(shareMessages.invalidPreset);
  const hash = `#${SHARE_LINK_FORMAT}/${gen}/${options.size}/${options.sea}/${preset}/${options.seed}`;
  const parsed = parseGeneratedShare(hash);
  return parsed.ok ? { ok: true, value: hash } : parsed;
}

/** Options for `generateSymmetricMap`; the standard preset is the plain call, as in the title form. */
export function shareGenerationOptions(share: GeneratedShare): MapGenerationOptions {
  return { size: share.size, sea: share.sea, seed: share.seed, ...(share.preset === 'frontline' ? { preset: 'frontline' as const } : {}) };
}
