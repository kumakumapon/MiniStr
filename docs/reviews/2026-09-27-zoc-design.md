# ZOC（支配地域）の設計調査 2026-09-27

対象: Issue #116 Phase 10.6（調査のみ）。調査時のコードは main `509e5cf`。

## 結論

- **技術的には実装できる**。霧の情報漏洩防止（#32 / #46 / #65）とも両立できる。ZOC を実装した試作で、既存の単体テスト400件（霧の漏洩防止と、CPU 対 CPU の全マップ回帰を含む）がすべて通った。
- **ただし、現時点では採用を推奨しない**。CPU 同士の計測では、制圧による決着は増えなかった（0 → 0）。一方で、後手（青）有利が大きく悪化した（判定勝ちの対象7マップで、赤26・青37 → 赤14・青49）。#122（CPU の攻勢）の課題が解消するまでは、ZOC は膠着と陣営の偏りを強めるだけになる。
- 採用する場合は、ルールバージョン（またはシナリオ単位の設定）で有効にする「大戦略モード」のような選択式にすることを推奨する。既定のルールにはしない。

## 想定した仕様

大戦略型の ZOC を、この盤面（4方向の隣接）に合わせて簡略化した。

1. 敵の地上・海上ユニットに隣接するマスを、その敵の支配地域（ZOC）とする。
2. 移動中に ZOC のマスに入ることはできるが、そこから先へは進めない（そのマスで移動が終わる）。
3. 移動を開始したマスが ZOC であっても、そこから出ることはできる（開始地点は例外）。
4. 航空ユニットは、ZOC を作らず、ZOC の影響も受けない。
5. 味方のユニットの隣接は、ZOC にならない。

## 霧との整合（最重要）

- ZOC は、`movementCosts(state, unitId)` に渡された状態に含まれるユニットから計算する。
- 移動範囲のプレビュー（`reachablePositionsForPlayer`）は、見えない敵を取り除いた状態で `movementCosts` を呼んでいる。そのため、**見えない敵の ZOC はプレビューに現れず、情報は漏れない**。危険域の表示（`enemyThreatPreview`）と CPU の移動候補も、同じ関数を通るので、自動的に同じ扱いになる。
- 実際の移動（`moveUnit`）では、見えない敵の ZOC も効く。プレビューの経路が見えない敵の ZOC に入った時点で、そのマスで移動を止める。これは、既存の遭遇処理（`hiddenEnemyEncounter`: 見えない敵の手前で止まる）を一般化したもので、止まったこと自体が「接触」として相手の存在を知らせる点も、既存の仕様と同じである。
- 移動後、隣接する敵はほとんどの場合、移動したユニットの視界（2以上）に入る。そのため、止まった理由が画面上で分からない、という状況は起きにくい。

## 必要な変更（試作で確認した箇所）

| 箇所 | 変更 | 備考 |
| --- | --- | --- |
| `commands.ts` `movementCosts` | ZOC のマスに入った後は、そこから展開しない（開始地点を除く） | 中核の変更 |
| `commands.ts` `pathFromMovementCosts` | ZOC のマスを、経路の途中（直前のマス）に選ばない | **試作で見つかった落とし穴**（下記） |
| `commands.ts` `hiddenEnemyEncounter` | 経路をたどり、見えない敵の ZOC に入った最初のマスで止める（見えない敵そのものの手前で止める既存の規則もそのまま） | |
| `threat.ts`、`ai/rules.ts`、UI の移動範囲 | 変更不要（`reachablePositionsForPlayer` を通るので自動的に反映される） | |
| ルールバージョン・セーブ | 新しいルールバージョン（または `ScenarioData` の設定）で有効にし、既存のセーブ・リプレイは記録時のルールで再現する | #114・#120 と同じ方式 |
| UI（任意） | 見えている敵の ZOC を盤面に表示する | 見えている敵だけなので、漏洩はない |

### 試作で見つかった落とし穴: 経路の組み立て

`pathFromMovementCosts` は、「コストが1歩分少ない隣のマス」を1つ前のマスとして選び、経路を組み立てる。ZOC のマスには「入れるが、そこから先には進めない」ので、コストの値だけを見ると、実際にはたどれない ZOC のマスを経由する経路を組み立ててしまう。

その結果、見えない敵との遭遇の判定が誤った経路を使い、CPU が「移動先に部隊がいる」（`Destination is occupied`）という不正な移動命令を出した（skirmish / hard / seed 15838 で発生）。経路の組み立てで ZOC のマス（開始地点を除く）を前のマスとして選ばないように直すと、不正な命令は出なくなった。本実装では、この点の回帰テストが必須である。

## 計測（試作）

- 試作: 下の付録の差分を `src/game/commands.ts` に当て、環境変数 `ZOC=1` で有効にした。試作はコミットしていない。
- 単体テスト: ZOC を有効にした状態で、既存の400件がすべて成功した。移動範囲の確認では、敵の歩兵の近くにいる戦車の移動可能マスが13 → 10 に減った。見えない敵の ZOC はプレビューに現れず、実際の移動がそのマスで止まることも確認した。
- 対局の計測: `npm run balance -- --rules modern --seeds 3 --rounds 60`（同じ難易度どうし、99局）

| 区分 | ZOC なし | ZOC あり |
| --- | --- | --- |
| 判定勝ちの対象7マップ（63局）の赤勝・青勝 | 26・37 | **14・49** |
| 同上の決着理由 | 判定 63 | 判定 63（制圧 0） |
| ターン制限・スコアのマップ（36局）の赤勝・青勝 | 10・26 | 11・25 |
| 全99局の所要時間 | 23秒 | 21秒 |

- 解釈: ZOC は前進を止めるので、先に前進する赤が敵の隣で足止めされ、そこを青に先制攻撃される、という既存の後手有利の構造（`2026-09-27-balance-adjustment.md`）を強めたと推測する。制圧による決着はどちらも0で、膠着の解消には寄与しない。
- 性能: ZOC のマスの計算は `movementCosts` の呼び出しごとに部隊数に比例する程度で、計測では所要時間は増えなかった。

## 推奨

1. 現時点では ZOC を実装しない。
2. #122（CPU の攻勢、特に隘路の突破と連携攻撃）が進んだ後に再評価する。その際は、ZOC を任意のモードとして追加し、陣営の偏りと制圧の割合を計測して判断する。
3. 実装する場合は、この文書の「必要な変更」の表と、経路の組み立ての回帰テストを必須とする。

## 付録: 試作の差分（`src/game/commands.ts`、コミットしていない）

```diff
diff --git a/src/game/commands.ts b/src/game/commands.ts
index e2da91e..604ee0c 100644
--- a/src/game/commands.ts
+++ b/src/game/commands.ts
@@ -69,6 +69,7 @@ export function movementCosts(state: GameState, unitId: string): Map<string, num
   const budget = Math.min(unitStats[unit.kind].movement, unit.fuel ?? unitStats[unit.kind].fuel);
   const occupied = new Set(state.units.filter((candidate): candidate is Unit & { position: Position } => candidate.id !== unitId && isDeployedUnit(candidate)).map(candidate => positionKey(candidate.position)));
   const costs = new Map<string, number>([[positionKey(unit.position), 0]]);
+  const zoc = zocTiles(state, unit);
   // Small frontier, so a linear-scan priority queue keeps the code simple without hurting performance.
   const frontier = new Map<string, { position: Position; cost: number }>([[positionKey(unit.position), { position: { ...unit.position }, cost: 0 }]]);
   while (frontier.size) {
@@ -77,6 +78,8 @@ export function movementCosts(state: GameState, unitId: string): Map<string, num
     for (const [candidateKey, entry] of frontier) if (!best || entry.cost < best.cost) { best = entry; bestKey = candidateKey; }
     frontier.delete(bestKey);
     const current = best!;
+    // ZOC prototype: a unit may enter an enemy's zone but not move on from it.
+    if (current.cost > 0 && zoc.has(positionKey(current.position))) continue;
     for (const next of [{ x: current.position.x + 1, y: current.position.y }, { x: current.position.x - 1, y: current.position.y }, { x: current.position.x, y: current.position.y + 1 }, { x: current.position.x, y: current.position.y - 1 }]) {
       const key = positionKey(next);
       if (occupied.has(key)) continue;
@@ -90,6 +93,17 @@ export function movementCosts(state: GameState, unitId: string): Map<string, num
   return costs;
 }
 
+const isAir = (kind: UnitKind) => unitStats[kind].fuelPerTurn > 0 && !['destroyer', 'landingShip', 'battleship'].includes(kind);
+export function zocTiles(state: GameState, unit: Unit): Set<string> {
+  const zoc = new Set<string>();
+  if (!((globalThis as { __ZOC?: boolean }).__ZOC ?? process.env.ZOC === '1') || isAir(unit.kind)) return zoc;
+  for (const enemy of state.units) {
+    if (enemy.owner === unit.owner || !isDeployedUnit(enemy) || isAir(enemy.kind)) continue;
+    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) zoc.add(positionKey({ x: enemy.position.x + dx!, y: enemy.position.y + dy! }));
+  }
+  return zoc;
+}
+
 /**
  * Reconstructs one lowest-cost route from the Dijkstra result.  The route is
  * stable so replaying an encounter always stops at the same tile.
@@ -101,6 +115,7 @@ function pathFromMovementCosts(
   costs: ReadonlyMap<string, number>,
 ): Position[] | undefined {
   const route = [{ ...destination }];
+  const zoc = zocTiles(state, unit);
   while (!samePosition(route[route.length - 1]!, unit.position)) {
     const current = route[route.length - 1]!;
     const currentCost = costs.get(positionKey(current));
@@ -109,7 +124,9 @@ function pathFromMovementCosts(
     const previous = [
       { x: current.x - 1, y: current.y }, { x: current.x + 1, y: current.y },
       { x: current.x, y: current.y - 1 }, { x: current.x, y: current.y + 1 },
-    ].filter(candidate => costs.get(positionKey(candidate)) === currentCost - step)
+    ].filter(candidate => costs.get(positionKey(candidate)) === currentCost - step
+      // ZOC prototype: a zone tile can end a move but never lies earlier on a route.
+      && (samePosition(candidate, unit.position) || !zoc.has(positionKey(candidate))))
       .sort((a, b) => a.y - b.y || a.x - b.x)[0];
     if (!previous) return undefined;
     route.push(previous);
@@ -137,13 +154,15 @@ function hiddenEnemyEncounter(
   if (!previewCosts.has(positionKey(destination))) return undefined;
   const route = pathFromMovementCosts(preview, unit, destination, previewCosts);
   if (!route) return undefined;
-  const encounterIndex = route.findIndex((position, index) => {
-    if (index === 0) return false;
+  const hiddenZoc = zocTiles({ ...state, units: state.units.filter(candidate => candidate.owner === unit.owner || (isDeployedUnit(candidate) && !visible.has(positionKey(candidate.position)))) }, unit);
+  let stop: Position | undefined;
+  for (let index = 1; index < route.length; index += 1) {
+    const position = route[index]!;
     const blocker = unitAt(state, position);
-    return !!blocker && blocker.owner !== unit.owner && !visible.has(positionKey(position));
-  });
-  if (encounterIndex < 1) return undefined;
-  const stop = route[encounterIndex - 1]!;
+    if (blocker && blocker.owner !== unit.owner && !visible.has(positionKey(position))) { stop = route[index - 1]!; break; }
+    if (hiddenZoc.has(positionKey(position)) && index < route.length - 1) { stop = position; break; }
+  }
+  if (!stop) return undefined;
   const spent = actualCosts.get(positionKey(stop));
   return spent === undefined ? undefined : { destination: stop, spent };
 }
```
