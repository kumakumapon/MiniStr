import { applyEditorTool, validateEditorScenario, type ScenarioEditorState } from './editor';
import { movementCost } from './terrain';
import { otherPlayer, type Board, type Position, type UnitKind } from './types';
import { unitStats, unitDefinitions } from './units';

/** Static terrain reachability ignores temporary occupancy and turn budgets. */
function canReach(board: Board, start: Position, target: Position, kind: UnitKind): boolean {
  const queue = [start];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    const key = `${p.x},${p.y}`;
    if (seen.has(key) || !Number.isFinite(movementCost(board, p, kind))) continue;
    seen.add(key);
    if (p.x === target.x && p.y === target.y) return true;
    queue.push({ x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y - 1 }, { x: p.x, y: p.y + 1 });
  }
  return false;
}

export interface EditorIssue {
  severity: 'error' | 'warning';
  message: string;
}
/** Playability is separate from the backward-compatible JSON schema. */
export function inspectEditorScenario(editor: ScenarioEditorState): EditorIssue[] {
  const parsed = validateEditorScenario(editor);
  if (!parsed.ok) return [{ severity: 'error', message: parsed.error }];
  const scenario = parsed.value[0]!;
  const issues: EditorIssue[] = [];
  const add = (severity: EditorIssue['severity'], message: string) => issues.push({ severity, message });
  if (scenario.board.width > 32 || scenario.board.height > 32 || scenario.initialUnits.length > 128) add('error', '対話プレイの上限は32×32、初期128部隊です。');
  for (const unit of scenario.initialUnits) {
    if (!Number.isFinite(movementCost(scenario.board, unit, unit.kind))) add('error', `${unit.kind} (${unit.x + 1}, ${unit.y + 1}) は配置地形に進入できません。`);
  }
  const tiles = scenario.board.terrain.flat();
  for (const player of ['red', 'blue'] as const) {
    const units = scenario.initialUnits.filter((unit) => unit.owner === player);
    const factories = tiles.filter((tile) => tile.owner === player && ['factory', 'airport', 'port'].includes(tile.kind));
    if (!units.length && !factories.length) add('error', `${player}: 初期部隊と生産施設がありません。`);
    // No production can be intentional in fixed-force/survival operations.
    const canFundProduction = scenario.startingGold >= unitStats.infantry.cost || tiles.some((tile) => tile.owner === player);
    const sources = [...units];
    if (canFundProduction)
      scenario.board.terrain.forEach((row, y) =>
        row.forEach((tile, x) => {
          if (tile.owner !== player) return;
          for (const [kind, definition] of Object.entries(unitDefinitions)) {
            if (
              tile.kind === definition.productionTerrain ||
              (scenario.productionRules === 'legacy-factory-air' && tile.kind === 'factory' && definition.productionTerrain === 'airport')
            )
              sources.push({ kind: kind as UnitKind, owner: player, x, y });
          }
        }),
      );
    const waterTransport = units.some((unit) => unit.kind === 'landingShip') || (canFundProduction && factories.some((tile) => tile.kind === 'port'));
    const reachable = (target: Position, capture: boolean) =>
      sources.some((unit) => (!capture || unitStats[unit.kind].capturePower > 0) && canReach(scenario.board, unit, target, unit.kind));
    const conditions = player === 'red' ? scenario.victoryConditions : scenario.defeatConditions;
    for (const condition of conditions) {
      const hasAlternative = conditions.some((candidate) => candidate !== condition && candidate.type !== condition.type);
      if (condition.type === 'captureCapital' && !tiles.some((tile) => tile.kind === 'capital' && tile.owner === otherPlayer(player)))
        add(hasAlternative ? 'warning' : 'error', `${player}: 占領対象となる敵司令部がありません。`);
      if (
        condition.type === 'score' &&
        !tiles.some((tile) => ['city', 'capital', 'factory', 'airport', 'port'].includes(tile.kind)) &&
        !scenario.initialUnits.some((unit) => unit.owner === otherPlayer(player))
      )
        add(hasAlternative ? 'warning' : 'error', `${player}: スコアを得られる拠点も撃破対象もありません。`);
      if (condition.type === 'captureCapital' && !waterTransport)
        scenario.board.terrain.forEach((row, y) =>
          row.forEach((tile, x) => {
            if (tile.kind === 'capital' && tile.owner === otherPlayer(player) && !reachable({ x, y }, true))
              add('warning', `${player}: 司令部 (${x + 1}, ${y + 1}) への占領部隊の経路がありません。輸送計画を確認してください。`);
          }),
        );
      if (condition.type === 'hold')
        for (const position of condition.positions) {
          if (!waterTransport && !reachable(position, false)) add('warning', `${player}: 保持目標 (${position.x + 1}, ${position.y + 1}) に到達できる部隊・生産経路がありません。`);
        }
    }
    if (units.some((unit) => ['fighter', 'bomber', 'helicopter'].includes(unit.kind)) && !tiles.some((tile) => tile.kind === 'airport' && tile.owner === player))
      add('warning', `${player}: 航空部隊の補給空港がありません。燃料切れに注意してください。`);
  }
  return issues;
}

export type PaintMode = 'brush' | 'rectangle' | 'fill' | 'symmetry';
/** Each bulk operation is one undo step, with all coordinates bounded. */
export function paintEditor(editor: ScenarioEditorState, at: Position, mode: PaintMode): ScenarioEditorState {
  const { width, height } = editor.data.board;
  if (at.x < 0 || at.y < 0 || at.x >= width || at.y >= height) return editor;
  if (mode === 'brush') return applyEditorTool(editor, at);
  const positions: Position[] = [];
  if (mode === 'rectangle') {
    for (let y = Math.min(editor.selected.y, at.y); y <= Math.max(editor.selected.y, at.y); y++)
      for (let x = Math.min(editor.selected.x, at.x); x <= Math.max(editor.selected.x, at.x); x++) positions.push({ x, y });
  } else if (mode === 'symmetry') positions.push(at, { x: width - 1 - at.x, y: height - 1 - at.y });
  else {
    const cells = new Map(editor.data.board.cells.map(([x, y, kind]) => [`${x},${y}`, kind]));
    const original = cells.get(`${at.x},${at.y}`) ?? editor.data.board.fill ?? 'plain';
    const queue = [at];
    const seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i]!;
      const key = `${p.x},${p.y}`;
      if (seen.has(key) || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
      seen.add(key);
      if ((cells.get(key) ?? editor.data.board.fill ?? 'plain') !== original) continue;
      positions.push(p);
      queue.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
    }
  }
  return {
    ...positions.reduce((state, p) => applyEditorTool(state, p), editor),
    selected: at,
  };
}

export function resizeEditor(editor: ScenarioEditorState, width: number, height: number): ScenarioEditorState {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 2 && value <= 32)) return editor;
  return {
    ...editor,
    selected: { x: 0, y: 0 },
    data: {
      ...editor.data,
      board: {
        ...editor.data.board,
        width,
        height,
        cells: editor.data.board.cells.filter(([x, y]) => x < width && y < height),
      },
      initialUnits: editor.data.initialUnits.filter((unit) => unit.x < width && unit.y < height),
    },
  };
}

export class EditorHistory {
  private past: ScenarioEditorState[] = [];
  private future: ScenarioEditorState[] = [];
  private lastGroup: string | undefined;
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(previous: ScenarioEditorState, next: ScenarioEditorState, group?: string): ScenarioEditorState {
    if (previous === next) return next;
    if (!group || group !== this.lastGroup) {
      this.past.push(structuredClone(previous));
      if (this.past.length > 100) this.past.shift();
    }
    this.lastGroup = group;
    this.future = [];
    return next;
  }
  finishGroup(): void {
    this.lastGroup = undefined;
  }
  undo(current: ScenarioEditorState): ScenarioEditorState {
    this.lastGroup = undefined;
    const previous = this.past.pop();
    if (!previous) return current;
    this.future.push(structuredClone(current));
    return previous;
  }
  redo(current: ScenarioEditorState): ScenarioEditorState {
    this.lastGroup = undefined;
    const next = this.future.pop();
    if (!next) return current;
    this.past.push(structuredClone(current));
    return next;
  }
}
