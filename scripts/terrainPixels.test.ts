import { describe, expect, it } from 'vitest';
import { compareTerrainCaptures, type TerrainCapture, type TerrainFrame } from '../tests/e2e/helpers/terrainPixels';

const region = { x: 0, y: 0, width: 1, height: 1 };
const capture = (source: string): TerrainCapture => ({ source, width: 1, height: 1, regions: [region] });
const frame = (red: number, green: number, blue: number): TerrainFrame => ({ width: 1, height: 1, data: [red, green, blue, 255] });

describe('batched terrain pixel comparison', () => {
  it('preserves the original maximum difference of channel means', async () => {
    const result = await compareTerrainCaptures([capture('board'), capture('preview')], async (source) => (source === 'board' ? frame(10, 20, 30) : frame(13, 27, 31)));
    expect(result).toEqual([{ board: [10, 20, 30], preview: [13, 27, 31], delta: 7 }]);
  });

  it('detects a mismatch at the unchanged eight-point boundary', async () => {
    const [result] = await compareTerrainCaptures([capture('board'), capture('preview')], async (source) => (source === 'board' ? frame(10, 20, 30) : frame(18, 20, 30)));
    expect(result!.delta).toBe(8);
    expect(result!.delta < 8).toBe(false);
  });

  it.each([1, 2])('excludes tile borders and compares all six cells at scale %s', async (scale) => {
    const regions = Array.from({ length: 6 }, (_, x) => ({ x: 1 + x * 3, y: 1, width: 2, height: 2 }));
    const actual: TerrainCapture = { source: 'board', width: 19, height: 4, regions };
    const preview: TerrainCapture = { source: 'preview', width: 12, height: 2, regions: regions.map((_, x) => ({ x: x * 2, y: 0, width: 2, height: 2 })) };
    const decode = async (source: string): Promise<TerrainFrame> => {
      const c = source === 'board' ? actual : preview;
      const width = c.width * scale,
        height = c.height * scale;
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      c.regions.forEach((r, index) => {
        for (let y = r.y * scale; y < (r.y + r.height) * scale; y++)
          for (let x = r.x * scale; x < (r.x + r.width) * scale; x++) {
            data.set([index * 20, index * 10, 30, 255], (y * width + x) * 4);
          }
      });
      return { width, height, data };
    };
    const result = await compareTerrainCaptures([actual, preview], decode);
    expect(result).toHaveLength(6);
    expect(result.map((value) => value.delta)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.map((value) => value.board[0])).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('averages all pixels rather than testing only one sample', async () => {
    const inputs: [TerrainCapture, TerrainCapture] = [capture('board'), capture('preview')];
    const result = await compareTerrainCaptures(inputs, async (source) =>
      source === 'board' ? { width: 2, height: 2, data: [0, 0, 0, 255, 0, 0, 0, 255, 40, 40, 40, 255, 40, 40, 40, 255] } : frame(20, 20, 20),
    );
    expect(result[0]!.board).toEqual([20, 20, 20]);
    expect(result[0]!.delta).toBe(0);
  });

  it.each([{ x: -1 }, { y: -1 }, { width: 0 }, { height: 0 }, { x: 1 }, { y: 1 }, { width: Number.NaN }])('rejects invalid or out-of-image regions %j', async (change) => {
    const invalid = { ...capture('board'), regions: [{ ...region, ...change }] };
    await expect(compareTerrainCaptures([invalid, capture('preview')], async () => frame(0, 0, 0))).rejects.toThrow();
  });

  it('rejects missing regions, invalid frames, empty crops, and decode failures', async () => {
    await expect(compareTerrainCaptures([{ ...capture('board'), regions: [] }, capture('preview')], async () => frame(0, 0, 0))).rejects.toThrow();
    await expect(compareTerrainCaptures([capture('board'), capture('preview')], async () => ({ width: 1, height: 1, data: [] }))).rejects.toThrow();
    await expect(compareTerrainCaptures([{ ...capture('board'), regions: [{ ...region, width: 0.1 }] }, capture('preview')], async () => frame(0, 0, 0))).rejects.toThrow();
    await expect(
      compareTerrainCaptures([capture('board'), capture('preview')], async () => {
        throw new Error('decode failed');
      }),
    ).rejects.toThrow('decode failed');
  });
});
