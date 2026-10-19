import { isPropertyTerrainKind } from './facilities';
import { loadScenarioDefinitions, type InitialUnit, type ScenarioData, type ScenarioDefinition } from './maps';
import { movementCost } from './terrain';
import type { GameResult, PlayerId, Position, TerrainKind, UnitKind } from './types';

export const GENERATED_SIZES = [16, 20, 24] as const;
export const GENERATED_SEAS = ['none', 'coast', 'ocean'] as const;
export interface MapGenerationOptions {
  size: (typeof GENERATED_SIZES)[number];
  sea: (typeof GENERATED_SEAS)[number];
  seed: string;
}
type Cell = [number, number, TerrainKind, PlayerId?];
const rotateOwner = (owner?: PlayerId) => (owner === undefined ? undefined : owner === 'red' ? 'blue' : 'red');

function reachable(scenario: ScenarioDefinition, start: Position, kind: UnitKind): Set<string> {
  const result = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index]!;
    for (const next of [
      { x: p.x - 1, y: p.y },
      { x: p.x + 1, y: p.y },
      { x: p.x, y: p.y - 1 },
      { x: p.x, y: p.y + 1 },
    ]) {
      const key = `${next.x},${next.y}`;
      if (!result.has(key) && Number.isFinite(movementCost(scenario.board, next, kind))) {
        result.add(key);
        queue.push(next);
      }
    }
  }
  return result;
}

/** Structural guarantees, independent of any win-rate claim or AI difficulty. */
export function inspectGeneratedMap(scenario: ScenarioDefinition): string[] {
  const errors = new Set<string>();
  const { width, height, terrain } = scenario.board;
  const capitals: Partial<Record<PlayerId, Position>> = {};
  const ports: Position[] = [];
  const properties: Position[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const tile = terrain[y]![x]!,
        opposite = terrain[height - 1 - y]![width - 1 - x]!;
      if (tile.kind !== opposite.kind || rotateOwner(tile.owner) !== opposite.owner) errors.add('地形または施設の所有が対称ではありません。');
      if (tile.kind === 'capital' && tile.owner) capitals[tile.owner] = { x, y };
      if (tile.kind === 'port') ports.push({ x, y });
      if (isPropertyTerrainKind(tile.kind)) properties.push({ x, y });
    }
  if (!capitals.red || !capitals.blue) errors.add('両軍の司令部が必要です。');
  if (capitals.red) {
    const land = reachable(scenario, capitals.red, 'tank');
    if (properties.some((p) => !land.has(`${p.x},${p.y}`))) errors.add('施設へ通じる陸路がありません。');
    if (scenario.initialUnits.some((unit) => unit.kind !== 'destroyer' && !land.has(`${unit.x},${unit.y}`))) errors.add('初期部隊が陸路から孤立しています。');
  }
  if (ports.length) {
    const sea = reachable(scenario, ports[0]!, 'destroyer');
    if (ports.some((p) => !sea.has(`${p.x},${p.y}`))) errors.add('港を結ぶ航路がありません。');
  }
  for (const unit of scenario.initialUnits)
    if (
      !scenario.initialUnits.some(
        (other) => other.owner === rotateOwner(unit.owner) && other.kind === unit.kind && other.x === width - 1 - unit.x && other.y === height - 1 - unit.y,
      )
    )
      errors.add('初期兵力が対称ではありません。');
  return [...errors];
}

export function generateSymmetricMap(input: unknown): GameResult<ScenarioDefinition> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '生成条件が不正です。' };
  const options = input as Record<string, unknown>;
  if (
    !GENERATED_SIZES.some((size) => size === options.size) ||
    !GENERATED_SEAS.some((sea) => sea === options.sea) ||
    typeof options.seed !== 'string' ||
    !/^[A-Za-z0-9_-]{1,24}$/.test(options.seed)
  )
    return { ok: false, error: 'サイズ・海域量と、英数字・ハイフン・アンダースコア1〜24文字のseedを指定してください。' };
  const size = options.size as MapGenerationOptions['size'],
    sea = options.sea as MapGenerationOptions['sea'],
    seed = options.seed;
  const width = size,
    height = size - 4;
  const band = sea === 'none' ? 0 : sea === 'coast' ? 1 : 2;
  const baseX = band + 1,
    baseY = band + 1;
  let randomState = 2166136261;
  for (let i = 0; i < seed.length; i++) randomState = Math.imul(randomState ^ seed.charCodeAt(i), 16777619);
  randomState = randomState >>> 0 || 1;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  };
  const cells = new Map<string, Cell>();
  const set = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => cells.set(`${x},${y}`, owner === undefined ? [x, y, kind] : [x, y, kind, owner]);
  const pair = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => {
    set(x, y, kind, owner);
    set(width - 1 - x, height - 1 - y, kind, rotateOwner(owner));
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (y * width + x >= (height * width) / 2) continue;
      const ocean = x < band || x >= width - band || y < band || y >= height - band;
      const roll = random();
      pair(x, y, ocean ? 'sea' : roll < 0.18 ? 'forest' : roll < 0.24 ? 'mountain' : roll < 0.3 ? 'swamp' : 'plain');
    }
  const roadY = height / 2 - 2;
  for (let x = band; x < width - band; x++) pair(x, roadY, 'road');
  for (let y = band; y < height - band; y++) pair(baseX + 1, y, 'road');
  for (let y = baseY; y <= baseY + 3; y++) for (let x = baseX - 1; x <= baseX + 2; x++) pair(x, y, 'plain');
  pair(baseX, baseY, 'capital', 'red');
  pair(baseX, baseY + 1, 'factory', 'red');
  pair(baseX + 2, baseY, 'airport', 'red');
  if (band) pair(band, baseY + 3, 'port', 'red');
  // Connect both bases through two horizontal approaches, preserving property tiles.
  const roadPair = (x: number, y: number) => {
    if (!isPropertyTerrainKind(cells.get(`${x},${y}`)![2])) pair(x, y, 'road');
  };
  for (let y = baseY; y <= roadY + 3; y++) roadPair(baseX + 1, y);
  const candidates: Position[] = [];
  for (let y = band + 1; y < height / 2; y++) for (let x = baseX + 3; x < width - baseX - 2; x++) candidates.push({ x, y });
  // Fisher-Yates keeps a seed stable across JavaScript engines.
  for (let i = candidates.length - 1; i > 0; i--) {
    const at = Math.floor(random() * (i + 1));
    [candidates[i], candidates[at]] = [candidates[at]!, candidates[i]!];
  }
  for (const city of candidates.slice(0, 3)) {
    for (let y = Math.min(city.y, roadY); y <= Math.max(city.y, roadY); y++) roadPair(city.x, y);
    pair(city.x, city.y, 'city');
  }
  const red: InitialUnit[] = [
    { kind: 'infantry', owner: 'red', x: baseX + 1, y: baseY },
    { kind: 'infantry', owner: 'red', x: baseX, y: baseY + 2 },
    { kind: 'tank', owner: 'red', x: baseX + 1, y: baseY + 1 },
    { kind: 'recon', owner: 'red', x: baseX + 2, y: baseY + 1 },
    { kind: 'artillery', owner: 'red', x: baseX + 1, y: baseY + 2 },
    { kind: 'apc', owner: 'red', x: baseX + 2, y: baseY + 2 },
    { kind: 'antiAir', owner: 'red', x: baseX - 1, y: baseY + 1 },
    ...(band ? [{ kind: 'destroyer' as const, owner: 'red' as const, x: band, y: baseY + 3 }] : []),
  ];
  const source: ScenarioData = {
    id: `generated-v1-${size}-${sea}-${seed}`,
    name: `生成戦域 ${seed}（${width}×${height}）`,
    briefing: `生成v1 / seed: ${seed} / ${width}×${height} / 海域: ${sea === 'none' ? 'なし' : sea === 'coast' ? '少なめ' : '多め'}。両軍の地形・施設・初期兵力は180度回転対称。二つの進軍路から敵司令部へ迫れ。後攻補償 +2000G。60ターン終了時に判定する。`,
    board: { width, height, cells: [...cells.values()] },
    startingGold: 6000,
    secondPlayerBonus: 2000,
    decisionRound: 60,
    productionRules: 'facility-v2',
    theme: band ? 'coastal' : 'temperate',
    initialUnits: [...red, ...red.map((unit) => ({ ...unit, owner: 'blue' as const, x: width - 1 - unit.x, y: height - 1 - unit.y }))],
    victoryConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
    defeatConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
  };
  const loaded = loadScenarioDefinitions([source]);
  if (!loaded.ok) return loaded;
  const scenario = loaded.value[0]!;
  const errors = inspectGeneratedMap(scenario);
  return errors.length ? { ok: false, error: errors.join(' ') } : { ok: true, value: scenario };
}
