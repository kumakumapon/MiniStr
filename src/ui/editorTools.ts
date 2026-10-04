import {
  availableScenarios,
  maps,
  scenarioThemes,
  type ScenarioEditorState,
} from "../game";
import type { EditorHistory, PaintMode } from "../game/editorTools";
import { escapeHtml } from "./strings";

export function renderEditorTools(
  editor: ScenarioEditorState,
  mode: PaintMode,
  history: EditorHistory,
): string {
  const catalog = availableScenarios().filter(
    (scenario) => !maps.some((map) => map.id === scenario.id),
  );
  return `<section class="editor-extra"><label>保存済みマップ<select id="editor-catalog"><option value="">選択</option>${catalog.map((scenario) => `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name)}</option>`).join("")}</select></label><button id="editor-load">編集</button><button id="editor-duplicate">複製</button><button id="editor-delete">削除</button><button id="editor-save">下書きを保存</button><p>名前・IDは右欄で編集できます。削除しても保存済み対局は再現できます。</p><label>描画<select id="editor-paint">${(["brush", "rectangle", "fill", "symmetry"] as const).map((value, i) => `<option value="${value}" ${mode === value ? "selected" : ""}>${["1マス", "選択点から矩形", "同じ地形を塗りつぶす", "180度対称"][i]}</option>`).join("")}</select></label><button id="editor-undo" ${history.canUndo ? "" : "disabled"}>元に戻す</button><button id="editor-redo" ${history.canRedo ? "" : "disabled"}>やり直す</button><label>幅<input id="editor-width" type="number" min="2" max="32" value="${editor.data.board.width}"></label><label>高さ<input id="editor-height" type="number" min="2" max="32" value="${editor.data.board.height}"></label><button id="editor-resize">サイズ適用</button><label>テーマ<select id="editor-theme">${scenarioThemes.map((theme) => `<option value="${theme}" ${theme === (editor.data.theme ?? "temperate") ? "selected" : ""}>${theme}</option>`).join("")}</select></label><button id="editor-add-objective">現在の勝利条件を追加</button><button id="editor-remove-objective">最後の勝利条件を削除</button><p>勝利条件 ${editor.data.victoryConditions.length}件 / 敗北条件 ${editor.data.defeatConditions.length}件。複数条件の詳細・敗北条件は下のJSONから編集できます。</p></section>`;
}
