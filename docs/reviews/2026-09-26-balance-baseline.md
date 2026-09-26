# CPU 対 CPU バランス計測ベースライン 2026-09-26

対象: Issue #116 Phase 10.1

## 計測条件

- コミット: `e8f1847`（`feature/116-balance-harness`。ゲーム規則・CPU は main `ca8a211` と同一）
- コマンド: `npm run balance -- --seeds 3 --rounds 60`
- 組み合わせ: 全11マップ × 3難易度（easy / normal / hard）× 2ルール（classic / modern）× 3シード（7919, 15838, 23757）
  - 従来ルールの admiralty は、初期配置に近代ルール専用ユニットがあるため計測対象外にした
  - 実際の対局数は 189局
- 両陣営とも同じ難易度の CPU が操作する。シードはダメージの乱数だけに影響し、CPU の判断自体は決定的である
- 所要時間: 99秒（Windows 11、Node 24）

## 要約

| 区分 | 局数 | 赤勝 | 青勝 | 未決着 | 平均の最大部隊数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 全体 | 189 | 24 | 55 | 110（58%） | 35 |
| 従来ルール | 90 | 13 | 27 | 50（56%） | 35 |
| 近代ルール | 99 | 11 | 28 | 60（61%） | 35 |
| easy | 63 | 8 | 21 | 34（54%） | 48 |
| normal | 63 | 8 | 18 | 37（59%） | 38 |
| hard | 63 | 8 | 16 | 39（62%） | 19 |

「平均の最大部隊数」は、条件（マップ×難易度×ルール）ごとに3シード中の最大部隊数を取り、それを区分内で平均した値である。

## 主な所見

1. **決着しない対局が過半数（58%）**: 60ラウンドで決着しない。ルールの違い（56% / 61%）より、マップと CPU の差の方が大きい。islands・canyon・river・marsh・admiralty は、すべての組み合わせで未決着だった。
2. **「決着」の多くはターン制限による**: landing（18ターン）・outpost（20ターン）で青が全勝している。これは制圧ではなく、ターン制限を超えたことによる防衛側（青）の勝利である。tundra の赤全勝も、15ターン生存条件による。industrial の決着は、スコア条件（12点）によるものが大半と推測する。ハーネスは決着理由を記録していないため、敵の全滅や司令部占領で決まった対局の数は特定できない。ただし、ターン制限・生存・スコアのどの条件も持たないマップで決着したのは、skirmish と siege の一部だけだった。決着理由の記録は、10.2 以降で追加する候補とする。
3. **hard の CPU が生産施設を自軍部隊で塞いでいる（10.2 の最優先課題）**: hard は最大部隊数が平均19と、easy の半分以下だった。skirmish（近代ルール、シード 7919）を追跡した結果は次のとおり。
   - 両陣営とも、5ターン目以降はすべての生産施設の上に自軍部隊がいて、生産できていない。
   - 資金は貯まる一方で、20ターン目で赤 74,960G・青 80,990G に達していた。
   - easy でも、赤は10ターン目以降、資金 2万G 前後を持ったまま施設を塞いでいる。
   - 移動先の評価（`evaluateCpuPosition`）が施設の防御補正を高く評価し、生産の機会を失うことを考慮していないのが原因と推測する（未検証）。
4. **近代ルールの修理費と生産の偏り**:
   - islands（近代ルール、normal / hard）では、重戦車が1条件あたり約40両生産され、平均修理費は約6.8万G だった。島の地形で活躍しにくい高価な重戦車に、資金が偏っていると推測する。
   - admiralty では駆逐艦・戦艦は生産されるが、決着はしていない（中央の港湾が詰まる可能性。#115 のリスク欄の懸念と一致する）。
5. **先手（赤）が不利な傾向**: 赤勝 24 に対して青勝 55 だった。ただし青勝の多くは所見2のターン制限によるものであり、先手の不利とは断定できない。10.2 以降、制圧による勝利が増えてから改めて評価する。

## 次フェーズへの反映（#116）

- **10.2（CPU の攻勢強化）**: 次の順で着手する。
  1. 生産施設を塞がないようにする（所見3）
  2. 膠着時の拠点攻略（所見1・2）
  3. APC の活用
- **10.3（部隊数の上限）**: easy の最大部隊数は最大 89（siege、従来ルール）だった。60 を超えたのは canyon・siege・river・industrial（近代ルール）・admiralty である。上限 50 の案は、easy の物量の積み上がりに効く。ただし所見3を直すと、hard・normal の部隊数も増える見込みなので、10.2 の後に改めて計測してから値を決める。
- **10.4（バランス調整）**: 重戦車の価格・性能と、海峡総力戦の港湾の配置を見直す候補とする。

## 詳細結果

計測条件: 最大 60 ラウンド、シード 3 種（7919, 15838, 23757）、所要 99 秒

| マップ | 難易度 | ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ターン | 最大部隊数 | 平均修理費（近代） | 生産上位 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| skirmish | easy | classic | 3 | 0% | 67% | 33% | 32.5 | 58 | 0 | infantry 150, tank 96, artillery 94, antiAir 3 |
| skirmish | normal | classic | 3 | 0% | 33% | 67% | 30.0 | 69 | 0 | infantry 84, artillery 65, tank 65, bomber 7 |
| skirmish | hard | classic | 3 | 0% | 0% | 100% | — | 13 | 0 | artillery 12, infantry 12, tank 9 |
| skirmish | easy | modern | 3 | 0% | 67% | 33% | 26.0 | 47 | 22910 | infantry 75, artillery 48, tank 36, mech 20 |
| skirmish | normal | modern | 3 | 0% | 0% | 100% | — | 69 | 23773 | infantry 94, artillery 60, tank 55, mech 18 |
| skirmish | hard | modern | 3 | 0% | 0% | 100% | — | 14 | 1103 | infantry 12, mech 7, helicopter 6, heavyTank 3 |
| islands | easy | classic | 3 | 0% | 0% | 100% | — | 20 | 0 | bomber 28, infantry 22, fighter 20, tank 18 |
| islands | normal | classic | 3 | 0% | 0% | 100% | — | 18 | 0 | infantry 32, tank 14, artillery 9, landingShip 7 |
| islands | hard | classic | 3 | 0% | 0% | 100% | — | 18 | 0 | infantry 18, tank 13, artillery 7, landingShip 7 |
| islands | easy | modern | 3 | 0% | 0% | 100% | — | 23 | 33660 | bomber 23, fighter 22, landingShip 16, mech 16 |
| islands | normal | modern | 3 | 0% | 0% | 100% | — | 18 | 68030 | heavyTank 39, infantry 37, mech 12, tank 10 |
| islands | hard | modern | 3 | 0% | 0% | 100% | — | 18 | 67580 | heavyTank 38, infantry 36, mech 12, tank 9 |
| landing | easy | classic | 3 | 0% | 100% | 0% | 19.0 | 19 | 0 | artillery 15, infantry 15, tank 12, destroyer 6 |
| landing | normal | classic | 3 | 0% | 100% | 0% | 19.0 | 16 | 0 | infantry 15, tank 12, artillery 9, destroyer 3 |
| landing | hard | classic | 3 | 0% | 100% | 0% | 19.0 | 12 | 0 | infantry 12, artillery 6, tank 6, destroyer 3 |
| landing | easy | modern | 3 | 0% | 100% | 0% | 19.0 | 19 | 1700 | infantry 15, tank 12, artillery 9, destroyer 6 |
| landing | normal | modern | 3 | 0% | 100% | 0% | 19.0 | 16 | 0 | infantry 12, tank 9, artillery 6, mech 6 |
| landing | hard | modern | 3 | 0% | 100% | 0% | 19.0 | 12 | 0 | infantry 9, mech 6, tank 6, artillery 3 |
| canyon | easy | classic | 3 | 0% | 0% | 100% | — | 79 | 0 | infantry 245, tank 147, artillery 145, antiAir 10 |
| canyon | normal | classic | 3 | 0% | 0% | 100% | — | 61 | 0 | infantry 114, tank 79, artillery 72, bomber 9 |
| canyon | hard | classic | 3 | 0% | 0% | 100% | — | 16 | 0 | infantry 9, antiAir 6, tank 6, fighter 3 |
| canyon | easy | modern | 3 | 0% | 0% | 100% | — | 74 | 7243 | infantry 207, artillery 125, tank 119, mech 30 |
| canyon | normal | modern | 3 | 0% | 0% | 100% | — | 65 | 19257 | infantry 91, tank 81, artillery 70, helicopter 26 |
| canyon | hard | modern | 3 | 0% | 0% | 100% | — | 22 | 17877 | helicopter 19, bomber 14, fighter 12, mech 11 |
| siege | easy | classic | 3 | 0% | 33% | 67% | 42.0 | 89 | 0 | infantry 230, tank 162, artillery 155, antiAir 7 |
| siege | normal | classic | 3 | 0% | 0% | 100% | — | 68 | 0 | infantry 176, tank 167, artillery 161, antiAir 10 |
| siege | hard | classic | 3 | 0% | 0% | 100% | — | 17 | 0 | infantry 11, artillery 6, tank 5, antiAir 1 |
| siege | easy | modern | 3 | 0% | 0% | 100% | — | 87 | 11250 | infantry 157, tank 117, artillery 116, mech 31 |
| siege | normal | modern | 3 | 33% | 0% | 67% | 50.0 | 63 | 49803 | tank 91, artillery 81, infantry 81, mech 18 |
| siege | hard | modern | 3 | 0% | 0% | 100% | — | 17 | 2123 | infantry 9, heavyTank 6, artillery 3, helicopter 3 |
| river | easy | classic | 3 | 0% | 0% | 100% | — | 72 | 0 | infantry 78, tank 66, artillery 63, destroyer 14 |
| river | normal | classic | 3 | 0% | 0% | 100% | — | 51 | 0 | infantry 61, artillery 44, tank 44, destroyer 15 |
| river | hard | classic | 3 | 0% | 0% | 100% | — | 29 | 0 | infantry 18, tank 15, artillery 12, bomber 9 |
| river | easy | modern | 3 | 0% | 0% | 100% | — | 69 | 57267 | infantry 83, tank 64, artillery 56, destroyer 27 |
| river | normal | modern | 3 | 0% | 0% | 100% | — | 30 | 0 | infantry 15, helicopter 12, mech 12, bomber 9 |
| river | hard | modern | 3 | 0% | 0% | 100% | — | 31 | 35507 | infantry 16, tank 14, mech 13, helicopter 12 |
| industrial | easy | classic | 3 | 67% | 33% | 0% | 13.0 | 47 | 0 | infantry 77, artillery 33, tank 30 |
| industrial | normal | classic | 3 | 33% | 67% | 0% | 26.3 | 33 | 0 | tank 40, infantry 33, artillery 32, bomber 4 |
| industrial | hard | classic | 3 | 33% | 67% | 0% | 23.7 | 27 | 0 | tank 30, artillery 26, infantry 20, antiAir 1 |
| industrial | easy | modern | 3 | 0% | 100% | 0% | 28.3 | 67 | 67 | infantry 89, artillery 41, tank 37, mech 15 |
| industrial | normal | modern | 3 | 0% | 100% | 0% | 11.7 | 27 | 480 | infantry 24, tank 14, artillery 9, mech 9 |
| industrial | hard | modern | 3 | 33% | 67% | 0% | 19.3 | 28 | 9393 | tank 20, artillery 17, infantry 17, mech 12 |
| tundra | easy | classic | 3 | 100% | 0% | 0% | 15.0 | 41 | 0 | infantry 47, artillery 41, tank 40, bomber 4 |
| tundra | normal | classic | 3 | 100% | 0% | 0% | 15.0 | 38 | 0 | infantry 59, tank 41, artillery 38 |
| tundra | hard | classic | 3 | 100% | 0% | 0% | 15.0 | 24 | 0 | tank 17, infantry 16, artillery 11 |
| tundra | easy | modern | 3 | 100% | 0% | 0% | 15.0 | 49 | 7073 | infantry 60, tank 39, artillery 29, mech 14 |
| tundra | normal | modern | 3 | 100% | 0% | 0% | 15.0 | 32 | 8817 | infantry 38, artillery 26, tank 23, mech 15 |
| tundra | hard | modern | 3 | 100% | 0% | 0% | 15.0 | 22 | 2030 | mech 12, heavyTank 6, infantry 6, artillery 3 |
| outpost | easy | classic | 3 | 0% | 100% | 0% | 21.0 | 22 | 0 | artillery 39, infantry 37, tank 32, bomber 3 |
| outpost | normal | classic | 3 | 0% | 100% | 0% | 21.0 | 21 | 0 | infantry 30, tank 28, artillery 24, bomber 4 |
| outpost | hard | classic | 3 | 0% | 100% | 0% | 21.0 | 16 | 0 | infantry 18, artillery 11, tank 11, fighter 7 |
| outpost | easy | modern | 3 | 0% | 100% | 0% | 21.0 | 23 | 21503 | infantry 25, artillery 24, mech 16, tank 15 |
| outpost | normal | modern | 3 | 0% | 100% | 0% | 21.0 | 14 | 2410 | mech 12, fighter 6, helicopter 6, bomber 3 |
| outpost | hard | modern | 3 | 0% | 100% | 0% | 21.0 | 11 | 4230 | helicopter 8, fighter 6, mech 6, bomber 3 |
| marsh | easy | classic | 3 | 0% | 0% | 100% | — | 30 | 0 | infantry 68, tank 31, artillery 22, bomber 8 |
| marsh | normal | classic | 3 | 0% | 0% | 100% | — | 13 | 0 | infantry 9, tank 6 |
| marsh | hard | classic | 3 | 0% | 0% | 100% | — | 11 | 0 | infantry 6, tank 3 |
| marsh | easy | modern | 3 | 0% | 0% | 100% | — | 18 | 0 | infantry 21, mech 9, helicopter 6, artillery 3 |
| marsh | normal | modern | 3 | 0% | 0% | 100% | — | 15 | 0 | helicopter 9, infantry 9, mech 3, tank 3 |
| marsh | hard | modern | 3 | 0% | 0% | 100% | — | 15 | 0 | infantry 12, helicopter 6, mech 3 |
| admiralty | easy | modern | 3 | 0% | 0% | 100% | — | 65 | 51950 | infantry 94, tank 73, artillery 68, destroyer 27 |
| admiralty | normal | modern | 3 | 0% | 0% | 100% | — | 60 | 46090 | artillery 47, infantry 46, tank 38, destroyer 12 |
| admiralty | hard | modern | 3 | 0% | 0% | 100% | — | 27 | 11560 | infantry 14, tank 14, artillery 8, battleship 7 |

最大部隊数は両陣営の合計（輸送中の部隊を含む）。修理費は近代ルールのみ（従来ルールの修理は無料のため 0）。

計測対象外:
- admiralty（classic）: 初期配置に近代ルール専用ユニット（mech）があるため、従来ルールでは計測できません。
