import { describe, expect, it } from 'vitest';
import { createScenarioEditor, maps, scenarioDefinitionToData } from './index';
import { EditorHistory, inspectEditorScenario, paintEditor, resizeEditor } from './editorTools';

describe('editor operations and playability', () => {
  it('accepts a score objective with no properties when an enemy unit can award the point', () => {
    const base = createScenarioEditor();
    const editor = {
      ...base,
      data: {
        ...base.data,
        board: {
          width: 4,
          height: 3,
          fill: 'plain' as const,
          cells: [] as const,
        },
        initialUnits: [
          { kind: 'tank' as const, owner: 'red' as const, x: 1, y: 1 },
          { kind: 'infantry' as const, owner: 'blue' as const, x: 2, y: 1 },
        ],
        victoryConditions: [{ type: 'score' as const, target: 1 }],
        defeatConditions: [{ type: 'eliminate' as const }],
      },
    };
    expect(inspectEditorScenario(editor).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('rejects an empty operation and invalid terrain while accepting every built-in map', () => {
    expect(inspectEditorScenario(createScenarioEditor()).filter((issue) => issue.severity === 'error').length).toBeGreaterThan(0);
    for (const map of maps)
      expect(
        inspectEditorScenario({
          ...createScenarioEditor(),
          data: scenarioDefinitionToData(map),
        }),
        map.id,
      ).toEqual([]);
    const editor = createScenarioEditor();
    editor.data = {
      ...editor.data,
      initialUnits: [{ kind: 'destroyer', owner: 'red', x: 1, y: 1 }],
    };
    expect(inspectEditorScenario(editor).some((issue) => issue.message.includes('(2, 2)'))).toBe(true);
    expect(inspectEditorScenario({ ...editor, data: { ...editor.data, id: '' } })[0]?.severity).toBe('error');
  });
  it('identifies an isolated capital and accepts an available sea transport plan', () => {
    const base = createScenarioEditor();
    const editor = {
      ...base,
      data: {
        ...base.data,
        board: {
          width: 5,
          height: 3,
          cells: [
            [0, 1, 'capital', 'red'],
            [4, 1, 'capital', 'blue'],
            [2, 0, 'sea'],
            [2, 1, 'sea'],
            [2, 2, 'sea'],
          ] as const,
        },
        initialUnits: [
          { kind: 'infantry' as const, owner: 'red' as const, x: 0, y: 1 },
          { kind: 'infantry' as const, owner: 'blue' as const, x: 4, y: 1 },
        ],
      },
    };
    expect(inspectEditorScenario(editor).filter((issue) => issue.message.includes('経路'))).toHaveLength(2);
    const transport = {
      ...editor,
      data: {
        ...editor.data,
        initialUnits: [...editor.data.initialUnits, { kind: 'landingShip' as const, owner: 'red' as const, x: 2, y: 1 }],
      },
    };
    expect(inspectEditorScenario(transport).filter((issue) => issue.message.includes('経路'))).toHaveLength(1);
  });
  it('supports rectangle/flood/rotational paint and coordinate bounds', () => {
    const editor = { ...createScenarioEditor(), terrain: 'forest' as const };
    expect(paintEditor(editor, { x: -1, y: 0 }, 'brush')).toBe(editor);
    expect(paintEditor(editor, { x: 1, y: 1 }, 'brush').data.board.cells).toHaveLength(1);
    expect(paintEditor(editor, { x: 1, y: 1 }, 'rectangle').data.board.cells).toHaveLength(4);
    expect(paintEditor(editor, { x: 0, y: 0 }, 'symmetry').data.board.cells.map((cell) => cell.slice(0, 2))).toEqual([
      [0, 0],
      [7, 5],
    ]);
    const divided = {
      ...editor,
      data: {
        ...editor.data,
        board: { width: 3, height: 1, cells: [[1, 0, 'sea']] as const },
      },
    };
    expect(paintEditor(divided, { x: 0, y: 0 }, 'fill').data.board.cells).toHaveLength(2);
    expect(paintEditor(editor, { x: 0, y: 0 }, 'fill').data.board.cells).toHaveLength(48);
  });
  it('undoes bulk edits, discards a branched redo and bounds retained history', () => {
    const original = createScenarioEditor();
    const history = new EditorHistory();
    expect(history.undo(original)).toBe(original);
    expect(history.redo(original)).toBe(original);
    expect(history.commit(original, original)).toBe(original);
    const painted = paintEditor({ ...original, terrain: 'sea' }, { x: 0, y: 0 }, 'fill');
    let current = history.commit(original, painted);
    expect(history.canUndo).toBe(true);
    current = history.undo(current);
    expect(current).toEqual(original);
    expect(history.canRedo).toBe(true);
    expect(history.redo(current)).toEqual(painted);
    for (let i = 0; i < 105; i++)
      current = history.commit(current, {
        ...current,
        selected: { x: i % 8, y: 0 },
      });
    for (let i = 0; i < 100; i++) current = history.undo(current);
    expect(history.canUndo).toBe(false);
    history.commit(current, { ...current, terrain: 'road' });
    expect(history.canRedo).toBe(false);
  });
  it('groups consecutive edits to one text field into a single undo step', () => {
    const original = createScenarioEditor();
    const history = new EditorHistory();
    const first = { ...original, data: { ...original.data, name: 'S' } };
    const second = { ...original, data: { ...original.data, name: 'Sa' } };
    const third = { ...original, data: { ...original.data, name: 'Save' } };
    history.commit(original, first, 'field:name');
    history.commit(first, second, 'field:name');
    const current = history.commit(second, third, 'field:name');
    expect(history.undo(current)).toEqual(original);
    expect(history.canUndo).toBe(false);
  });
  it('crops units and cells on resize and rejects invalid dimensions', () => {
    const editor = { ...createScenarioEditor(), tool: 'unit' as const };
    const unit = paintEditor(editor, { x: 7, y: 5 }, 'brush');
    expect(resizeEditor(unit, 4, 4).data.initialUnits).toEqual([]);
    expect(resizeEditor(unit, 0, 4)).toBe(unit);
    expect(resizeEditor(unit, 33, 4)).toBe(unit);
  });
});
