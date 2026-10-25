import { describe, expect, it } from 'vitest';
import { GENERATED_SEAS, GENERATED_SIZES, generateSymmetricMap, generatedBattleSeed } from './mapGenerator';
import { scenarioDefinitionToData } from './maps';
import {
  SHARE_GEN1_GENERATIONS,
  SHARE_HASH_MAX_LENGTH,
  isShareLinkCandidate,
  parseGeneratedShare,
  serializeGeneratedShare,
  shareGenerationOptions,
  shareMessages,
} from './shareLink';

const valid = '#ministr-gen1/2/20/coast/standard/MiniStr-1';
const messages = Object.values(shareMessages);

describe('share link format', () => {
  it('writes the fixed order and separators', () => {
    expect(serializeGeneratedShare({ size: 20, sea: 'coast', seed: 'MiniStr-1' })).toEqual({ ok: true, value: valid });
    expect(serializeGeneratedShare({ size: 24, sea: 'ocean', preset: 'frontline', seed: 'a_b-9' })).toEqual({ ok: true, value: '#ministr-gen1/3/24/ocean/frontline/a_b-9' });
  });

  it('freezes the generation table: only v2 standard and v3 frontline', () => {
    expect(SHARE_GEN1_GENERATIONS).toEqual({ 2: 'standard', 3: 'frontline' });
  });

  it('keeps the longest possible link far below the length limit', () => {
    const longest = serializeGeneratedShare({ size: 24, sea: 'ocean', preset: 'frontline', seed: 'a'.repeat(24) });
    expect(longest.ok && longest.value.length - 1).toBe(58);
  });

  for (const size of GENERATED_SIZES)
    for (const sea of GENERATED_SEAS)
      for (const preset of ['standard', 'frontline'] as const)
        it(`rebuilds the same map and battle stream for ${size}/${sea}/${preset}`, () => {
          const form = { size, sea, preset, seed: 'Share-Q9' };
          const link = serializeGeneratedShare(form);
          expect(link.ok).toBe(true);
          const parsed = parseGeneratedShare(link.ok ? link.value : '');
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.value).toEqual({ gen: preset === 'frontline' ? 3 : 2, size, sea, preset, seed: 'Share-Q9' });
          const direct = generateSymmetricMap(form);
          const shared = generateSymmetricMap(shareGenerationOptions(parsed.value));
          expect(direct.ok && shared.ok).toBe(true);
          if (!direct.ok || !shared.ok) return;
          expect(JSON.stringify(scenarioDefinitionToData(shared.value))).toBe(JSON.stringify(scenarioDefinitionToData(direct.value)));
          expect(shared.value.battleSeed).toBe(direct.value.battleSeed);
          expect(shared.value.battleSeed).toBe(generatedBattleSeed({ size, sea, seed: 'Share-Q9' }));
          expect(shared.value.id).toBe(direct.value.id);
        });
});

describe('share link recognition', () => {
  it('treats only the ministr-gen family as a link, so other hashes stay ignored', () => {
    expect(isShareLinkCandidate(valid)).toBe(true);
    expect(isShareLinkCandidate('#ministr-gen2/anything')).toBe(true);
    for (const hash of ['', '#', '#foo', '#ministr', 'ministr-gen1/2', '#/ministr-gen1']) expect(isShareLinkCandidate(hash)).toBe(false);
  });
});

describe('share link rejection', () => {
  const rejected: [string, string, string][] = [
    ['empty', '', shareMessages.malformed],
    ['hash only', '#', shareMessages.malformed],
    ['unknown prefix', '#other/2/20/coast/standard/a', shareMessages.malformed],
    ['future link format', '#ministr-gen2/2/20/coast/standard/a', shareMessages.unsupportedFormat],
    ['format without separators', '#ministr-gen1', shareMessages.malformed],
    ['generation v1', '#ministr-gen1/1/20/coast/standard/a', shareMessages.unsupportedGeneration],
    ['generation v4', '#ministr-gen1/4/20/coast/standard/a', shareMessages.unsupportedGeneration],
    ['generation padded', '#ministr-gen1/02/20/coast/standard/a', shareMessages.unsupportedGeneration],
    ['unknown size', '#ministr-gen1/2/18/coast/standard/a', shareMessages.invalidSize],
    ['padded size', '#ministr-gen1/2/020/coast/standard/a', shareMessages.invalidSize],
    ['unknown sea', '#ministr-gen1/2/20/lake/standard/a', shareMessages.invalidSea],
    ['uppercase sea', '#ministr-gen1/2/20/Coast/standard/a', shareMessages.invalidSea],
    ['unknown preset', '#ministr-gen1/2/20/coast/deluxe/a', shareMessages.invalidPreset],
    ['uppercase preset', '#ministr-gen1/2/20/coast/Standard/a', shareMessages.invalidPreset],
    ['generation and preset disagree (v2 frontline)', '#ministr-gen1/2/20/coast/frontline/a', shareMessages.presetMismatch],
    ['generation and preset disagree (v3 standard)', '#ministr-gen1/3/20/coast/standard/a', shareMessages.presetMismatch],
    ['uppercase format', '#MINISTR-GEN1/2/20/coast/standard/a', shareMessages.malformed],
    ['extra segment', '#ministr-gen1/2/20/coast/standard/a/b', shareMessages.malformed],
    ['missing seed', '#ministr-gen1/2/20/coast/standard', shareMessages.malformed],
    ['empty seed', '#ministr-gen1/2/20/coast/standard/', shareMessages.malformed],
    ['empty middle segment', '#ministr-gen1/2//coast/standard/a', shareMessages.malformed],
    ['trailing slash', '#ministr-gen1/2/20/coast/standard/a/', shareMessages.malformed],
    ['seed too long', `#ministr-gen1/2/20/coast/standard/${'a'.repeat(25)}`, shareMessages.invalidSeed],
    ['seed with comma', '#ministr-gen1/2/20/coast/standard/a,b', shareMessages.invalidSeed],
    ['seed with space', '#ministr-gen1/2/20/coast/standard/a b', shareMessages.invalidSeed],
    ['percent-encoded seed', '#ministr-gen1/2/20/coast/standard/%41', shareMessages.invalidSeed],
    ['percent-encoded separator', '#ministr-gen1%2F2/20/coast/standard/a', shareMessages.unsupportedFormat],
    ['percent-encoded segment', '#ministr-gen1/2/20/%63oast/standard/a', shareMessages.invalidSea],
    ['control character', '#ministr-gen1/2/20/coast/standard/a\u0000', shareMessages.invalidSeed],
    ['newline', '#ministr-gen1/2/20/coast/standard/a\n', shareMessages.invalidSeed],
    ['unicode seed', '#ministr-gen1/2/20/coast/standard/ａｂｃ', shareMessages.invalidSeed],
    ['markup seed', '#ministr-gen1/2/20/coast/standard/<script>', shareMessages.invalidSeed],
    ['query-like tail', '#ministr-gen1/2/20/coast/standard/a?x=1', shareMessages.invalidSeed],
    ['hash inside', '#ministr-gen1/2/20/coast/standard/a#b', shareMessages.invalidSeed],
    ['daily-style seed', '#ministr-gen1/2/20/coast/standard/D20260501', shareMessages.dailySeed],
    ['daily-style seed on frontline', '#ministr-gen1/3/20/coast/frontline/D20260501', shareMessages.dailySeed],
    ['huge', `#ministr-gen1/2/20/coast/standard/${'a'.repeat(5000)}`, shareMessages.tooLong],
    ['just over the limit', `#${'x'.repeat(SHARE_HASH_MAX_LENGTH + 1)}`, shareMessages.tooLong],
  ];
  for (const [name, hash, error] of rejected)
    it(`rejects ${name} with a fixed message`, () => {
      const result = parseGeneratedShare(hash);
      expect(result).toEqual({ ok: false, error });
      expect(messages).toContain(error);
      // The input is never echoed back.
      expect(error).not.toContain(hash.slice(1, 40) || '\u0001');
    });

  it('accepts a seed that merely starts with D, and one with the wrong digit count', () => {
    for (const seed of ['D1234567', 'D123456789', 'Daily20260501', 'd20260501']) expect(parseGeneratedShare(`#ministr-gen1/2/20/coast/standard/${seed}`).ok).toBe(true);
  });

  it('accepts the hash with or without the leading #', () => {
    expect(parseGeneratedShare(valid.slice(1)).ok).toBe(true);
  });

  it('checks the length before anything else', () => {
    expect(parseGeneratedShare(`#${'/'.repeat(SHARE_HASH_MAX_LENGTH + 1)}`)).toEqual({ ok: false, error: shareMessages.tooLong });
    expect(parseGeneratedShare(`#ministr-gen1/2/20/coast/standard/${'a'.repeat(SHARE_HASH_MAX_LENGTH - 33)}`).ok).toBe(false);
  });

  it('never throws on non-string input', () => {
    for (const value of [undefined, null, 5, {}, [], Symbol.iterator]) expect(parseGeneratedShare(value)).toEqual({ ok: false, error: shareMessages.malformed });
  });

  it('refuses to write links the reader would refuse', () => {
    expect(serializeGeneratedShare({ size: 20, sea: 'coast', seed: 'D20260501' })).toEqual({ ok: false, error: shareMessages.dailySeed });
    expect(serializeGeneratedShare({ size: 20, sea: 'coast', seed: 'bad seed' })).toEqual({ ok: false, error: shareMessages.invalidSeed });
    expect(serializeGeneratedShare({ size: 21, sea: 'coast', seed: 'a' })).toEqual({ ok: false, error: shareMessages.invalidSize });
    expect(serializeGeneratedShare({ size: 20, sea: 'lake', seed: 'a' })).toEqual({ ok: false, error: shareMessages.invalidSea });
    expect(serializeGeneratedShare({ size: 20, sea: 'coast', seed: 'a', preset: 'x' })).toEqual({ ok: false, error: shareMessages.invalidPreset });
    expect(serializeGeneratedShare({ size: 20, sea: 'coast', seed: '' })).toEqual({ ok: false, error: shareMessages.malformed });
  });
});

describe('released link meaning is frozen', () => {
  it('keeps a known link rebuilding the exact same terrain', () => {
    const parsed = parseGeneratedShare('#ministr-gen1/2/16/none/standard/Frozen-1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const generated = generateSymmetricMap(shareGenerationOptions(parsed.value));
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    expect(generated.value.id).toBe('generated-v2-16-none-Frozen-1');
    expect(generated.value.battleSeed).toBe(generatedBattleSeed({ size: 16, sea: 'none', seed: 'Frozen-1' }));
    // A fingerprint of the terrain: if generation ever changes, a gen1 link would silently mean another map.
    const terrain = generated.value.board.terrain.map((row) => row.map((tile) => `${tile.kind[0]}${tile.owner?.[0] ?? ''}`).join(',')).join('|');
    let hash = 2166136261;
    for (let at = 0; at < terrain.length; at++) hash = Math.imul(hash ^ terrain.charCodeAt(at), 16777619);
    expect(hash >>> 0).toBe(FROZEN_GEN1_FINGERPRINT);
  });
});

const FROZEN_GEN1_FINGERPRINT = 49627535;
