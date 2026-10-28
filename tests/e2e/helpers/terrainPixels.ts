export interface TerrainRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerrainFrame {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface TerrainCapture {
  source: string;
  width: number;
  height: number;
  regions: TerrainRegion[];
}

/** Self-contained so Playwright can run this function in the browser. The
 * optional decoder lets Node tests exercise the exact same pixel comparison. */
export async function compareTerrainCaptures(captures: [TerrainCapture, TerrainCapture], decode?: (source: string) => Promise<TerrainFrame>) {
  const decodeFrame =
    decode ??
    (async (source: string): Promise<TerrainFrame> => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cannot read terrain screenshot pixels.');
      context.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
    });
  const frames = await Promise.all(captures.map((capture) => decodeFrame(capture.source)));
  const means = captures.map((capture, index) => {
    const frame = frames[index]!;
    if (
      ![capture.width, capture.height].every((value) => Number.isFinite(value) && value > 0) ||
      ![frame.width, frame.height].every((value) => Number.isSafeInteger(value) && value > 0) ||
      frame.data.length !== frame.width * frame.height * 4
    )
      throw new Error('Invalid terrain capture dimensions.');
    return capture.regions.map((region) => {
      if (
        ![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
        region.x < 0 ||
        region.y < 0 ||
        region.width <= 0 ||
        region.height <= 0 ||
        region.x + region.width > capture.width ||
        region.y + region.height > capture.height
      )
        throw new Error('Invalid terrain comparison region.');
      // CSS coordinates are relative to the captured element. Account for the
      // browser's device scale without averaging tile borders or adjacent art.
      const left = Math.round((region.x * frame.width) / capture.width);
      const top = Math.round((region.y * frame.height) / capture.height);
      const right = Math.round(((region.x + region.width) * frame.width) / capture.width);
      const bottom = Math.round(((region.y + region.height) * frame.height) / capture.height);
      if (right <= left || bottom <= top) throw new Error('Terrain comparison region has no pixels.');
      const totals = [0, 0, 0];
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const offset = (y * frame.width + x) * 4;
          for (let channel = 0; channel < 3; channel++) totals[channel]! += frame.data[offset + channel]!;
        }
      return totals.map((total) => total / ((right - left) * (bottom - top)));
    });
  });
  if (means[0]!.length === 0 || means[0]!.length !== means[1]!.length) throw new Error('Terrain capture regions do not match.');
  return means[0]!.map((board, index) => {
    const preview = means[1]![index]!;
    return { board, preview, delta: Math.max(...board.map((value, channel) => Math.abs(value - preview[channel]!))) };
  });
}
