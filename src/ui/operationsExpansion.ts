import { controlObjective } from '../game/control';
import { remainingRecon, RECON_RADIUS } from '../game/recon';
import { usesReconRules, type GameState, type PlayerId } from '../game/types';
import { availableScenarios, createScenarioInitialState, loadScenarioDefinitions, type ScenarioDefinition } from '../game/maps';
import {
  challengeNames,
  isDefaultOperationRecord,
  operationIds,
  operationRevision,
  operationTurnTarget,
  OPERATION_CHALLENGES,
  type OperationRecord,
  type OperationRecords,
} from '../game/operationRecords';
import { unitNames } from './labels';
import { escapeHtml } from './strings';

export function renderReconControl(state: GameState, player: PlayerId, enabled: boolean, targeting: boolean): string {
  if (!usesReconRules(state)) return '';
  const remaining = remainingRecon(state, player);
  return `<section class="recon-control" aria-label="広域偵察"><button id="recon-target" class="save-action" aria-pressed="${targeting}" ${!enabled || remaining === 0 ? 'disabled' : ''}>広域偵察：残り${remaining}回</button>${targeting ? '<button id="recon-cancel" class="save-action">中止</button>' : ''}<span id="recon-instructions" role="status">${targeting ? '偵察するマスを選択してください。Escでも中止できます。' : `指定マスから半径${RECON_RADIUS}。自軍のこの手番中だけ視認します。`}</span></section>`;
}
export function renderControlObjective(state: GameState, scenario: ScenarioDefinition): string {
  const objective = controlObjective(scenario);
  if (!objective) return '';
  return `<section class="control-score" aria-label="拠点支配得点"><strong>拠点支配：赤 ${state.controlScores?.red ?? 0} ／ 青 ${state.controlScores?.blue ?? 0}（目標${objective.target}）</strong><details><summary>支配拠点と得点規則</summary><p>所有する各拠点につきラウンド終了時に1点。常駐は不要。同時到達は高得点側が勝利し、同点は継続します。拠点の所有と得点は両軍へ公開されます。</p><ul>${objective.positions.map((p) => `<li><button class="save-action" data-control-x="${p.x}" data-control-y="${p.y}">(${p.x + 1}, ${p.y + 1})：${state.board.terrain[p.y]![p.x]!.owner === 'red' ? '赤軍' : state.board.terrain[p.y]![p.x]!.owner === 'blue' ? '青軍' : '中立'}</button></li>`).join('')}</ul></details></section>`;
}
export function renderOperationChallenges(id: string, record?: OperationRecord): string {
  if (!operationIds.has(id)) return '';
  return `<section class="operation-challenges" aria-label="追加チャレンジ"><h3>追加チャレンジ</h3><p>勝利とは別の達成課題です。能力・資金の報酬はありません。</p><ul>${OPERATION_CHALLENGES.map((challenge) => `<li class="${record?.challenges.includes(challenge) ? 'achieved' : ''}">${record?.challenges.includes(challenge) ? '✓ 達成' : record ? '未達成' : '目標'}：${challenge === 'swift' ? `${operationTurnTarget(id)}ターン以内` : challengeNames[challenge]}</li>`).join('')}</ul>${record ? `<p>今回の記録：${record.bestTurns}ターン ／ 味方損失${record.bestLosses}</p>` : ''}</section>`;
}
function setupDescription(record: OperationRecord): string {
  const loaded = loadScenarioDefinitions([JSON.parse(record.configuration)]);
  if (!loaded.ok) return '';
  const scenario = loaded.value[0]!,
    state = createScenarioInitialState(scenario);
  return (['red', 'blue'] as const)
    .map((player) => {
      const army = scenario.initialUnits
        .filter((unit) => unit.owner === player)
        .map((unit) => `${unitNames[unit.kind]} (${unit.x + 1},${unit.y + 1})`)
        .join('・');
      return `${player === 'red' ? '赤軍' : '青軍'}：開始${state.players[player].gold}G ／ ${army}`;
    })
    .join('\n');
}
export function renderOperationRecords(catalog: OperationRecords | undefined, notice: string, open: boolean): string {
  return `<details id="operation-records" class="history-panel operation-records" ${open ? 'open' : ''}><summary id="operation-records-heading">単体作戦の戦績・チャレンジ${catalog ? `：${catalog.records.length}条件` : ''}</summary><p>人間の赤軍対CPUの組み込み単体作戦が対象。同じ作戦版・ルール・難易度・編成条件の最良値と達成済み課題を保存します。各最良値は別の対局で達成される場合があります。</p>${notice ? `<p role="${catalog ? 'status' : 'alert'}">${escapeHtml(notice)}</p>` : ''}${
    !catalog
      ? '<button id="operation-records-reset" class="save-action">戦績保存を初期化</button>'
      : catalog.records.length
        ? `<ol>${catalog.records
            .map((record, index) => {
              const current = availableScenarios().find((scenario) => scenario.id === record.scenarioId);
              const currentVersion = !!current && operationRevision(current) === record.revision;
              return `<li><article><h3>${escapeHtml(current?.name ?? record.scenarioId)}</h3><p>${record.difficulty === 'easy' ? '易しい' : record.difficulty === 'hard' ? '難しい' : '普通'} ／ ${isDefaultOperationRecord(record) ? '標準編成' : '編成変更'} ／ ${currentVersion ? '現行作戦' : '旧作戦'} ／ ${record.ruleVersion >= 7 ? '広域偵察あり' : '旧ルール'}</p><p>クリア済み・最短${record.bestTurns}ターン・最小損失${record.bestLosses}</p><p>達成：${record.challenges.length ? record.challenges.map((challenge) => escapeHtml(challengeNames[challenge])).join(' ／ ') : '追加課題なし'}</p><details><summary>編成条件</summary><p class="record-setup">${escapeHtml(setupDescription(record))}</p></details><button class="save-action" data-record-delete="${index}">この条件の戦績を削除</button></article></li>`;
            })
            .join('')}</ol>`
        : '<p>クリア記録はまだありません。</p>'
  }</details>`;
}
