import { isEvacuationCondition, exportScenarioEditorJson, terrainKinds, type ScenarioEditorState, type UnitKind } from '../game';
import type { EditorHistory, PaintMode } from '../game/editorTools';
import { terrainNames, unitNames, unitTokens } from './labels';
import { escapeHtml } from './strings';
import { renderEditorTools } from './editorTools';
const editorVictoryKinds = ['eliminate', 'captureCapital', 'hold', 'survive', 'score', 'control', 'escort', 'withdraw'] as const;
export function renderEditorView(editor: ScenarioEditorState, editorNotice: string, paintMode: PaintMode, editorHistory: EditorHistory): string {
  const editorVictory = editor.data.victoryConditions[0] ?? {
    type: 'captureCapital' as const,
  };
  const editorVictoryTarget =
    editorVictory.type === 'hold'
      ? editorVictory.turns
      : editorVictory.type === 'survive'
        ? editorVictory.untilTurn
        : editorVictory.type === 'score' || editorVictory.type === 'control'
          ? editorVictory.target
          : isEvacuationCondition(editorVictory)
            ? editorVictory.required
            : 1;
  const cellsByPosition = new Map(editor.data.board.cells.map((cell) => [`${Number(cell[0])},${Number(cell[1])}`, cell] as const));
  const counts = { red: 0, blue: 0 };
  const unitsByPosition = new Map(
    editor.data.initialUnits.map((unit) => {
      const id = `${unit.owner[0]}${++counts[unit.owner]}`;
      return [`${Number(unit.x)},${Number(unit.y)}`, { ...unit, id }] as const;
    }),
  );
  const editorBoard = Array.from({ length: editor.data.board.height }, (_, y) =>
    Array.from({ length: editor.data.board.width }, (_, x) => {
      const cell = cellsByPosition.get(`${Number(x)},${Number(y)}`);
      const terrain = cell?.[2] ?? 'plain';
      const owner = cell?.[3];
      const unit = unitsByPosition.get(`${Number(x)},${Number(y)}`);
      const ownerLabel = owner === 'red' ? '自' : owner === 'blue' ? '敵' : '';
      return `<button class="editor-tile ${terrain} ${editor.selected.x === x && editor.selected.y === y ? 'selected' : ''}" data-editor-x="${Number(x)}" data-editor-y="${Number(y)}" title="(${Number(x + 1)}, ${Number(y + 1)}) ${terrainNames[terrain]}${ownerLabel ? `・${ownerLabel}` : ''}${unit ? `・${unit.id} ${unitNames[unit.kind]}` : ''}" aria-label="(${Number(x + 1)}, ${Number(y + 1)}) ${terrainNames[terrain]}${unit ? `、${unit.id} ${unitNames[unit.kind]}` : ''}"><span>${terrain === 'plain' ? '' : terrain === 'forest' ? '森' : terrain === 'mountain' ? '山' : terrain === 'sea' ? '海' : terrain === 'road' ? '道' : terrain === 'supplyDepot' ? '補' : terrain === 'city' ? '市' : terrain === 'factory' ? '工' : terrain === 'airport' ? '空' : terrain === 'port' ? '港' : '司'}</span><i>${ownerLabel}</i>${unit ? `<b class="${escapeHtml(unit.owner)}">${unitTokens[unit.kind]}</b><small class="editor-unit-id">${unit.id}</small>` : ''}</button>`;
    }).join(''),
  ).join('');
  return `<div class="editor-overlay" role="dialog" aria-modal="true" aria-labelledby="editor-title"><section class="editor-screen"><div class="editor-heading"><div><p class="card-kicker">SCENARIO EDITOR</p><h2 id="editor-title">最小マップエディタ</h2><p>盤面を選択し、地形・拠点所有者・初期ユニット・勝利条件を設定します。JSONは既存の検証器で確認されます。</p></div><button id="editor-close" class="save-action">閉じる</button></div>${renderEditorTools(editor, paintMode, editorHistory)}<div class="editor-layout"><section class="editor-workspace"><div class="editor-toolbar"><label>編集<select id="editor-tool"><option value="terrain" ${editor.tool === 'terrain' ? 'selected' : ''}>地形・拠点</option><option value="unit" ${editor.tool === 'unit' ? 'selected' : ''}>初期ユニット</option><option value="eraseUnit" ${editor.tool === 'eraseUnit' ? 'selected' : ''}>ユニット削除</option></select></label><label>地形<select id="editor-terrain">${terrainKinds.map((kind) => `<option value="${kind}" ${kind === editor.terrain ? 'selected' : ''}>${terrainNames[kind]}</option>`).join('')}</select></label><label>所有者<select id="editor-owner"><option value="">中立 / なし</option><option value="red" ${editor.owner === 'red' ? 'selected' : ''}>自軍</option><option value="blue" ${editor.owner === 'blue' ? 'selected' : ''}>敵軍</option></select></label><label>ユニット<select id="editor-unit-kind">${(Object.keys(unitNames) as UnitKind[]).map((kind) => `<option value="${kind}" ${kind === editor.unitKind ? 'selected' : ''}>${unitNames[kind]}</option>`).join('')}</select></label><label>陣営<select id="editor-unit-owner"><option value="red" ${editor.unitOwner === 'red' ? 'selected' : ''}>自軍</option><option value="blue" ${editor.unitOwner === 'blue' ? 'selected' : ''}>敵軍</option></select></label></div><div data-ui-copy class="editor-board" style="grid-template-columns:repeat(${Number(editor.data.board.width)},1fr)">${editorBoard}</div><p class="editor-coordinates">選択中: (${Number(editor.selected.x + 1)}, ${Number(editor.selected.y + 1)})</p></section><section class="editor-fields"><label>ID<input id="editor-id" value="${escapeHtml(editor.data.id)}"></label><label>作戦名<input id="editor-name" value="${escapeHtml(editor.data.name)}"></label><label>概要<textarea id="editor-briefing">${escapeHtml(editor.data.briefing)}</textarea></label><label>開始資金<input id="editor-gold" type="number" min="0" value="${Number(editor.data.startingGold)}"></label><label>勝利条件<select id="editor-victory">${editorVictoryKinds.map((kind) => `<option value="${kind}" ${editorVictory.type === kind ? 'selected' : ''}>${kind === 'eliminate' ? '敵軍を全滅' : kind === 'captureCapital' ? '敵司令部を占領' : kind === 'hold' ? '選択地点を保持' : kind === 'survive' ? '規定ターン生存' : kind === 'escort' ? '指定部隊を護衛・脱出' : kind === 'withdraw' ? '指定数の部隊を撤退' : kind === 'control' ? '拠点支配で毎ラウンド加点' : 'スコア到達'}</option>`).join('')}</select></label><label>目標値<input id="editor-victory-target" type="number" min="1" value="${Number(editorVictoryTarget)}"></label>${isEvacuationCondition(editorVictory) ? `<label>対象ID（r1, r2 など）<input id="editor-victory-units" value="${escapeHtml(editorVictory.unitIds.join(', '))}"></label><button id="editor-use-exit" class="save-action">選択地点を脱出地点にする</button><p class="editor-hint">対象IDは赤軍の初期部隊の並び順です。目標値は必要撤退数。複数の脱出地点はJSONから指定できます。</p>` : ''}<p class="editor-hint">「保持」と「拠点支配」は選択マスを目標にします。拠点支配は両軍共通の目標点で競います。複数拠点はJSONから指定できます。</p></section></div><section class="editor-json"><div><h3>JSON 入出力</h3><p>読み込み時・検証時ともに、通常のシナリオと同じ安全なバリデーションを使います。</p></div><textarea id="editor-json" aria-label="シナリオJSON">${escapeHtml(exportScenarioEditorJson(editor))}</textarea><div class="editor-actions"><button id="editor-export" class="save-action">JSONを書き出す</button><button id="editor-import" class="save-action">JSONを反映</button><button id="editor-validate" class="end-turn">シナリオを検証</button><button id="editor-start" class="end-turn">保存してこのシナリオで開始</button></div><p data-ui-copy id="editor-notice" class="editor-notice" aria-live="polite" ${editorNotice ? '' : 'hidden'}>${escapeHtml(editorNotice)}</p></section></section></div>`;
}
