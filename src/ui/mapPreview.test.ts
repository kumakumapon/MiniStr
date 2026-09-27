import { describe, expect, it } from 'vitest';
import { createBoard, maps } from '../game';
import { renderMapPreview } from './mapPreview';

const runs = (svg: string) =>
  [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#[0-9a-f]{6})"\/>/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    fill: match[4]!,
  }));
/** The colour drawn at a cell, whichever run covers it. */
const colourAt = (svg: string, x: number, y = 0) => runs(svg).find((run) => run.y === y && run.x <= x && x < run.x + run.width)?.fill;
/** Every cell is covered exactly once. */
const coveredCells = (svg: string) => runs(svg).reduce((total, run) => total + run.width, 0);

describe('map preview (#145)', () => {
  it('covers every cell in a viewBox matching the board, merging runs of one colour', () => {
    const svg = renderMapPreview(createBoard(4, 3), [], 'temperate');
    expect(svg).toMatch(/^<svg class="map-preview" viewBox="0 0 4 3" [^>]*aria-hidden="true"/);
    expect(coveredCells(svg)).toBe(12);
    // An all-plain board is one rect per row.
    expect(runs(svg)).toHaveLength(3);
  });

  it('colours terrain by kind, and plains by theme', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![1] = { kind: 'sea' };
    const temperate = renderMapPreview(board, [], 'temperate');
    expect(colourAt(temperate, 1)).not.toBe(colourAt(temperate, 0));
    for (const theme of ['desert', 'snow', 'urban', 'coastal'] as const) {
      expect(colourAt(renderMapPreview(board, [], theme), 0), theme).not.toBe(colourAt(temperate, 0));
    }
  });

  it('marks properties in their owner’s colour, headquarters larger', () => {
    const board = createBoard(3, 1);
    board.terrain[0]![0] = { kind: 'capital', owner: 'red' };
    board.terrain[0]![1] = { kind: 'city', owner: 'blue' };
    board.terrain[0]![2] = { kind: 'factory' };
    const properties = [
      ...renderMapPreview(board, [], 'temperate').matchAll(/class="map-preview-property" x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="(#[0-9a-f]{6})"/g),
    ];
    expect(properties).toHaveLength(3);
    const [capital, city, factory] = properties.map((match) => ({ width: Number(match[2]), fill: match[3] }));
    expect(new Set([capital!.fill, city!.fill, factory!.fill]).size).toBe(3);
    expect(capital!.width).toBeGreaterThan(city!.width);
  });

  it('dots starting units by owner and ignores positions off the board', () => {
    const svg = renderMapPreview(
      createBoard(3, 3),
      [
        { owner: 'red', x: 0, y: 0 },
        { owner: 'blue', x: 2, y: 2 },
        { owner: 'blue', x: 3, y: 0 },
        { owner: 'red', x: -1, y: 1 },
        { owner: 'red', x: 0.5, y: 1 },
      ],
      'temperate',
    );
    const dots = [...svg.matchAll(/class="map-preview-unit" cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" fill="(#[0-9a-f]{6})"/g)];
    expect(dots.map((match) => [match[1], match[2]])).toEqual([
      ['0.5', '0.5'],
      ['2.5', '2.5'],
    ]);
    expect(dots[0]![3]).not.toBe(dots[1]![3]);
  });

  it('draws nothing for a board it cannot trust', () => {
    expect(renderMapPreview({ width: 0, height: 3, terrain: [] }, [], 'temperate')).toBe('');
    expect(renderMapPreview({ width: 300, height: 3, terrain: [] }, [], 'temperate')).toBe('');
  });

  it('renders every built-in map', () => {
    for (const map of maps) {
      const svg = renderMapPreview(map.board, map.initialUnits, map.theme);
      expect(coveredCells(svg), map.id).toBe(map.board.width * map.board.height);
      expect(svg, map.id).toContain('map-preview-unit');
    }
  });

  it('keeps unexpected data out of the markup (#145 review)', () => {
    const board = { width: 3, height: 2, terrain: [[{ kind: '__proto__' }, { kind: '"><script>' }, { kind: 'city', owner: '"><b>' }]] } as never;
    const svg = renderMapPreview(board, [{ owner: '"><i>' as never, x: 0, y: 0 }], 'constructor' as never);
    // Unknown kinds and the missing second row fall back to plain; the city keeps its own colour.
    const plain = colourAt(renderMapPreview(createBoard(1, 1), [], 'temperate'), 0);
    expect(runs(svg).map((run) => [run.x, run.y, run.width, run.fill === plain])).toEqual([
      [0, 0, 2, true],
      [2, 0, 1, false],
      [0, 1, 3, true],
    ]);
    // An unknown owner is drawn as neutral.
    const neutral = [
      ...renderMapPreview({ width: 1, height: 1, terrain: [[{ kind: 'city' }]] }, [], 'temperate').matchAll(/map-preview-property[^>]*fill="(#[0-9a-f]{6})"/g),
    ][0]![1];
    expect(svg).toContain(`fill="${neutral}"`);
    expect(coveredCells(svg)).toBe(6);
    expect(svg).not.toMatch(/script|<b>|<i>|__proto__|constructor/);
    // No attribute value carries markup.
    expect(svg).not.toMatch(/="[^"]*[<>]/);
    for (const match of svg.matchAll(/fill="([^"]*)"/g)) expect(match[1]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('draws nothing for dimensions that are not whole numbers', () => {
    expect(renderMapPreview({ width: Number.NaN, height: 3, terrain: [] }, [], 'temperate')).toBe('');
    expect(renderMapPreview({ width: 2.5, height: 3, terrain: [] }, [], 'temperate')).toBe('');
  });
});
