import {
  playerOwnedProperties,
  repairCost,
  REPAIR_HP_PER_TURN,
  unitStats,
  type GameCommand,
  type GameState,
  type PlayerId,
  type UnitKind,
} from "../game";
import { unitNames } from "./labels";
import { escapeHtml } from "./strings";

const lessons: readonly {
  command: GameCommand["type"];
  title: string;
  text: string;
}[] = [
  {
    command: "move",
    title: "移動",
    text: "歩兵 (1,2) を選び、下の都市 (1,3) を選びます。矢印キーとEnterでも操作できます。",
  },
  {
    command: "attack",
    title: "攻撃",
    text: "戦車 (4,2) を選び、隣の敵歩兵 (5,2) を選びます。戦闘予測には乱数による幅があり、反撃もあり得ます。",
  },
  {
    command: "capture",
    title: "占領",
    text: "都市にいる歩兵を選び「占領」。占領が完了するまでターンをまたいで繰り返します。",
  },
  {
    command: "endTurn",
    title: "ターン終了・補給",
    text: "未行動部隊を確認し、ターンを終了します。自軍拠点は収入源です。対応する補給拠点や装甲兵員輸送車の隣で弾薬・燃料を補充できます。",
  },
  {
    command: "produce",
    title: "生産",
    text: "空いている自軍工場 (2,1) を選び、歩兵を生産します。施設が埋まっている時は部隊を移動させます。",
  },
  {
    command: "embark",
    title: "輸送",
    text: "歩兵を装甲兵員輸送車の隣へ移動し「搭載」。次のターンに輸送車を進め、さらに次のターンに空いた陸地へ降車できます。",
  },
];

export function lessonProgress(
  state: GameState,
  viewer: PlayerId,
  commands: readonly GameCommand[],
): boolean[] {
  return lessons.map((lesson) => {
    if (lesson.command === "capture")
      return (
        commands.some((command) => command.type === "capture") &&
        playerOwnedProperties(state, viewer).length > 0
      );
    if (lesson.command === "embark") {
      return commands.some(
        (command, index) =>
          command.type === "embark" &&
          commands
            .slice(index + 1)
            .some(
              (next) =>
                next.type === "disembark" &&
                next.transportId === command.transportId,
            ),
      );
    }
    return commands.some((command) => command.type === lesson.command);
  });
}

export function renderLearning(
  state: GameState,
  viewer: PlayerId,
  commands: readonly GameCommand[],
  open: boolean,
): string {
  const progress = lessonProgress(state, viewer, commands);
  const training = state.scenarioId === "training";
  const income = playerOwnedProperties(state, viewer).length * 1000;
  return `<details id="learning-panel" class="learning-panel" ${open ? "open" : ""}><summary>操作ガイド・兵科比較（閉じるとヒントをスキップ）</summary>${training ? `<ol>${lessons.map((lesson, i) => `<li><strong>${progress[i] ? "✓ " : ""}${lesson.title}</strong><p>${lesson.text}</p></li>`).join("")}</ol>` : "<p>ユニットを選択→移動先または攻撃先を選択。占領は歩兵系ユニットで行います。矢印キー・Enter・N（次の部隊）が使えます。</p>"}<p>次の自軍ターンの収入見込み: ${income}G。修理は対応施設で最大${REPAIR_HP_PER_TURN}HP、歩兵なら最大${repairCost("infantry", REPAIR_HP_PER_TURN)}Gです。航空機は空港、艦船は港湾で補給します。</p><p>判定時は拠点数、同数なら残存部隊の価値で比較します。完全同点では決着せず、次のターンへ進みます。相手の燃料・残弾・資金は非公開で、脅威表示は補給済みを仮定します。</p><div class="unit-reference" tabindex="0" role="region" aria-label="兵科比較表"><table><thead><tr><th>兵科</th><th>費用</th><th>移動</th><th>射程</th><th>燃料</th><th>毎ターン消費</th></tr></thead><tbody>${(Object.keys(unitStats) as UnitKind[]).map((kind) => `<tr><th>${escapeHtml(unitNames[kind])}</th><td>${unitStats[kind].cost}</td><td>${unitStats[kind].movement}</td><td>${unitStats[kind].range.join("–")}</td><td>${unitStats[kind].fuel}</td><td>${unitStats[kind].fuelPerTurn}</td></tr>`).join("")}</tbody></table></div></details>`;
}
