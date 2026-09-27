import { describe, expect, it } from 'vitest';
import { createBoard, maps } from '../game';
import { renderMapPreview } from './mapPreview';

const rects = (svg: string) => [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="(#[0-9a-f]{6})"\/>/g)];

describe('map preview (#145)', () => {
  it('draws one tile per cell in a viewBox matching the board', () => {
    const svg = renderMapPreview(createBoard(4, 3), [], 'temperate');
    expect(svg).toMatch(/^<svg class="map-preview" viewBox="0 0 4 3" [^>]*aria-hidden="true"/);
    expect(rects(svg)).toHaveLength(12);
  });

  it('colours terrain by kind, and plains by theme', () => {
    const board = createBoard(2, 1);
    board.terrain[0]![1] = { kind: 'sea' };
    const colour = (svg: string, x: number) => rects(svg).find((match) => match[1] === String(x))![3];
    const temperate = renderMapPreview(board, [], 'temperate');
    expect(colour(temperate, 1)).not.toBe(colour(temperate, 0));
    expect(colour(renderMapPreview(board, [], 'desert'), 0)).not.toBe(colour(temperate, 0));
    expect(colour(renderMapPreview(board, [], 'snow'), 0)).not.toBe(colour(temperate, 0));
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
      expect(rects(svg), map.id).toHaveLength(map.board.width * map.board.height);
      expect(svg, map.id).toContain('map-preview-unit');
    }
  });
});
