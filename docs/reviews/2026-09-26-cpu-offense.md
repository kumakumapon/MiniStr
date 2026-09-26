# CPU 攻勢強化の効果測定 2026-09-26

対象: Issue #116 Phase 10.2。比較の基準はベースライン（`2026-09-26-balance-baseline.md`）。

## 結論

- **CPU の不具合は直った**:
  - hard の CPU が自軍の生産施設を塞いで生産できなかった問題を解消した。hard の平均の最大部隊数は 19 から 42 になった。
  - 弾薬 0 の部隊を補給対象から外していたバグも直した。
- **決着率は改善していない**: 未決着は 58% → 59% で、Issue の受け入れ条件（未決着の割合がベースラインより下がる）は**満たしていない**。
- 途中で決着率が 55% に下がった版もあった。しかしその改善は、回復する守備隊へ不利な攻撃を際限なく繰り返す挙動によるものだった。差分レビューで High と指摘されて修正したところ、改善は消えた。人間の相手にとって突きやすい弱点になるので、採用しなかった。

## 計測条件

- ブランチ: `feature/116-cpu-offense`。計測時の CPU ロジックはコミット `3c150f3` と同一。
- 全体: `npm run balance -- --seeds 3 --rounds 60`（ベースラインと同じ。189局、所要163秒）
- 難易度の違う対戦: `npm run balance -- --maps skirmish,siege,canyon,river,marsh,islands --rules modern --seeds 2 --rounds 60 --difficulty hard --blue easy`、および `--difficulty easy --blue hard`（陣営を入れ替える）

## 最終的な変更内容（`src/ai/rules.ts`）

1. **生産施設の居座り防止**: 自軍の生産施設の上で手番を終えると、評価を下げる（-45）。次のすべてを満たすときだけ適用する。
   - 生産できる資金がある
   - 生産の上限に達していない
   - 2マス以内に、見えている敵の占領ユニットがいない
   - 補給が必要な部隊・HP 50 以下の部隊ではない
2. **集中攻撃**: 撃破が確実な敵を優先して攻撃する。
3. **膠着時の攻勢**: 21ラウンド目以降、見えている敵の反撃リスクの重みを徐々に下げる（最大 60%）。攻撃の条件も緩める。判断に使うのは公開情報のラウンド数だけ。
4. **補給車の配置**（近代ルール）: 補給が必要な自軍の地上部隊の隣を高く評価する。
5. **生産の上限**: 自軍の部隊数が、海と山を除いたマス数の 25%（最低 8）に達したら、通常の生産を控える。輸送艦と、見えている敵への対抗生産は例外。この上限は CPU だけの方針で、人間には適用されない（ゲーム規則の上限は 10.3 で扱う）。
6. **拠点の守備隊の排除**: 占領が必要な拠点にいる敵には、不利な交換も許容する（司令部 +30、その他の拠点 +15）。ただし次の3条件を満たすときに限る。
   - 与ダメージが拠点での回復量（20）以上
   - 3マス以内に、占領できる味方がいる
   - 許容幅の合計が 30 以下
7. **不具合の修正**: `needsSupply` が、弾薬 0 の武装ユニットを補給対象から外していた。
8. **計測ツール**: `--blue <難易度>` で、青軍の難易度を別に指定できるようにした。

## 結果

| 指標 | ベースライン | 10.2 最終 |
| --- | ---: | ---: |
| 未決着（全189局） | 110局（58%） | 111局（59%） |
| 未決着（勝敗条件が全滅・司令部占領だけのマップ7種、117局） | 110局（94%） | 111局（95%） |
| hard の平均の最大部隊数 | 19.0 | 41.6 |
| 平均の最大部隊数（全体） | 35.2 | 41.4 |

「勝敗条件が全滅・司令部占領だけのマップ」は skirmish / islands / canyon / siege / river / marsh / admiralty の7種。

### 難易度の違う対戦（近代ルール、6マップ × 2シード × 陣営の入れ替え、計24局）

| 組み合わせ | hard の勝ち | easy の勝ち | 未決着 |
| --- | ---: | ---: | ---: |
| 赤 hard 対 青 easy | 0 | 1（skirmish） | 11 |
| 赤 easy 対 青 hard | 0 | 0 | 12 |

hard が easy に勝てていない。24局中、決着は1局だけで、標本が小さいため「逆転」とまでは断定できない。ただし、難易度の高い CPU ほど強いことは示せていない。

## 試して効果の無かったこと（記録）

どれも、未決着の割合を有意に下げなかった。調べた範囲は、全体計測、または5マップ × 3難易度 × 2ルール × 2シードの部分計測。

- hard の距離・脅威・地形の重みの変更（距離 4→8/10、脅威 1.6→1.0、地形 1.35→1.0）
- 守備隊を排除する条件から「占領できる味方が近くにいる」を外す
- 連携攻撃: 味方全体の合計ダメージで守備隊を撃破できるときだけ、不利な交換を許容する。未決着は 93% のまま変わらず、実装は取り下げた。

## 分析: なぜ決着しないのか

1. **盤面の渋滞**: 生産の上限（変更5）が無い段階では、canyon で通行できる111マスのうち93マスが部隊で埋まり、行動の大半が「待機」になっていた。上限を設けてこれは解消したが、決着は増えなかった。
2. **隘路を突破できない**: canyon・river・islands・marsh・admiralty は、変更の前後を通じて全組み合わせで未決着だった。1体ずつ損得を判断する今の CPU では、狭い通り道で互角の戦線を押し切れない。
3. **同じ CPU どうしの対戦は互角になりやすい**: 左右対称のマップで同じ CPU を戦わせるので、構造的に膠着しやすい。未決着の割合は、CPU の強さの指標としては限界がある。

## 次のステップの提案

1. **難易度の再設計**: 重みの違いではなく、読みの深さで差を付ける。例えば、数手先の反撃を考慮する、部隊どうしの役割を分担する（前衛・間接攻撃部隊・観測役）。成否は `--blue` を使った難易度の違う対戦で評価する。
2. **ゲーム規則による決着の促進**: 10.3（部隊数の上限）に加えて、指定ターンで拠点数の多い側が勝つ判定勝ちなど、ルール側で決着を付ける仕組みも候補にする。
3. **決着理由の記録**: 計測ツールで、決着の理由（全滅・司令部占領・ターン制限・スコア）を記録する。

## 詳細結果（10.2 最終、全189局）

計測条件: 最大 60 ラウンド、シード 3 種（7919, 15838, 23757）、所要 163 秒

| マップ | 難易度 | ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ターン | 最大部隊数 | 平均修理費（近代） | 生産上位 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| skirmish | easy | classic | 3 | 0% | 100% | 0% | 48.7 | 38 | 0 | infantry 125, tank 94, artillery 86, antiAir 11 |
| skirmish | normal | classic | 3 | 33% | 0% | 67% | 40.0 | 38 | 0 | infantry 160, tank 113, artillery 101, bomber 7 |
| skirmish | hard | classic | 3 | 0% | 0% | 100% | — | 38 | 0 | infantry 178, tank 149, artillery 131, antiAir 6 |
| skirmish | easy | modern | 3 | 0% | 67% | 33% | 57.5 | 38 | 53247 | infantry 163, artillery 77, tank 74, mech 48 |
| skirmish | normal | modern | 3 | 0% | 0% | 100% | — | 39 | 45877 | infantry 141, artillery 82, tank 82, mech 36 |
| skirmish | hard | modern | 3 | 0% | 0% | 100% | — | 39 | 54140 | infantry 143, tank 107, artillery 99, mech 39 |
| islands | easy | classic | 3 | 0% | 0% | 100% | — | 19 | 0 | bomber 20, fighter 18, infantry 18, artillery 12 |
| islands | normal | classic | 3 | 0% | 0% | 100% | — | 18 | 0 | infantry 18, artillery 9, landingShip 9, tank 9 |
| islands | hard | classic | 3 | 0% | 0% | 100% | — | 17 | 0 | infantry 18, tank 12, artillery 9, landingShip 9 |
| islands | easy | modern | 3 | 0% | 0% | 100% | — | 21 | 51173 | bomber 30, landingShip 19, fighter 18, helicopter 14 |
| islands | normal | modern | 3 | 0% | 0% | 100% | — | 19 | 15973 | infantry 76, landingShip 14, mech 12, antiAir 6 |
| islands | hard | modern | 3 | 0% | 0% | 100% | — | 19 | 10103 | infantry 21, landingShip 14, mech 9, tank 9 |
| landing | easy | classic | 3 | 0% | 100% | 0% | 19.0 | 19 | 0 | infantry 18, artillery 12, tank 12, destroyer 3 |
| landing | normal | classic | 3 | 0% | 100% | 0% | 19.0 | 18 | 0 | infantry 18, artillery 12, tank 12 |
| landing | hard | classic | 3 | 0% | 100% | 0% | 19.0 | 18 | 0 | infantry 18, tank 15, artillery 12, landingShip 3 |
| landing | easy | modern | 3 | 0% | 100% | 0% | 19.0 | 21 | 0 | infantry 15, mech 11, artillery 9, tank 9 |
| landing | normal | modern | 3 | 0% | 100% | 0% | 19.0 | 21 | 0 | infantry 18, artillery 12, tank 9, mech 6 |
| landing | hard | modern | 3 | 0% | 100% | 0% | 19.0 | 19 | 0 | infantry 15, artillery 9, mech 9, tank 9 |
| canyon | easy | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 270, tank 147, artillery 133, antiAir 13 |
| canyon | normal | classic | 3 | 0% | 0% | 100% | — | 55 | 0 | infantry 198, tank 118, artillery 112, antiAir 13 |
| canyon | hard | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 137, artillery 96, tank 93, bomber 7 |
| canyon | easy | modern | 3 | 0% | 0% | 100% | — | 54 | 15187 | infantry 216, artillery 96, tank 93, helicopter 39 |
| canyon | normal | modern | 3 | 0% | 0% | 100% | — | 55 | 9957 | infantry 151, artillery 85, tank 76, helicopter 25 |
| canyon | hard | modern | 3 | 0% | 0% | 100% | — | 55 | 12227 | infantry 110, artillery 86, tank 84, mech 20 |
| siege | easy | classic | 3 | 0% | 0% | 100% | — | 52 | 0 | infantry 195, tank 157, artillery 134, antiAir 12 |
| siege | normal | classic | 3 | 0% | 0% | 100% | — | 67 | 0 | infantry 244, tank 177, artillery 161, antiAir 11 |
| siege | hard | classic | 3 | 0% | 0% | 100% | — | 62 | 0 | infantry 182, tank 177, artillery 157, antiAir 10 |
| siege | easy | modern | 3 | 0% | 0% | 100% | — | 54 | 31170 | infantry 199, tank 106, artillery 99, mech 53 |
| siege | normal | modern | 3 | 0% | 0% | 100% | — | 58 | 48210 | infantry 182, artillery 141, tank 120, mech 30 |
| siege | hard | modern | 3 | 0% | 0% | 100% | — | 65 | 49550 | infantry 229, tank 153, artillery 150, mech 40 |
| river | easy | classic | 3 | 0% | 0% | 100% | — | 55 | 0 | infantry 151, tank 111, artillery 73, landingShip 48 |
| river | normal | classic | 3 | 0% | 0% | 100% | — | 56 | 0 | infantry 84, artillery 72, tank 62, destroyer 34 |
| river | hard | classic | 3 | 0% | 0% | 100% | — | 55 | 0 | infantry 78, destroyer 52, artillery 39, tank 30 |
| river | easy | modern | 3 | 0% | 0% | 100% | — | 56 | 64840 | infantry 110, tank 78, artillery 63, bomber 21 |
| river | normal | modern | 3 | 0% | 0% | 100% | — | 57 | 90837 | infantry 70, artillery 58, tank 51, destroyer 33 |
| river | hard | modern | 3 | 0% | 0% | 100% | — | 54 | 5600 | infantry 72, tank 33, artillery 27, mech 12 |
| industrial | easy | classic | 3 | 67% | 33% | 0% | 12.3 | 52 | 0 | infantry 90, tank 30, artillery 28 |
| industrial | normal | classic | 3 | 33% | 67% | 0% | 18.7 | 58 | 0 | infantry 84, artillery 47, tank 42 |
| industrial | hard | classic | 3 | 0% | 100% | 0% | 22.3 | 63 | 0 | infantry 83, artillery 65, tank 47 |
| industrial | easy | modern | 3 | 33% | 67% | 0% | 16.7 | 66 | 357 | infantry 102, tank 34, artillery 33, mech 12 |
| industrial | normal | modern | 3 | 0% | 100% | 0% | 11.0 | 49 | 1150 | infantry 84, artillery 19, tank 18, mech 12 |
| industrial | hard | modern | 3 | 0% | 100% | 0% | 12.0 | 56 | 2903 | infantry 87, tank 24, artillery 22, mech 12 |
| tundra | easy | classic | 3 | 100% | 0% | 0% | 15.0 | 44 | 0 | infantry 68, tank 50, artillery 44, bomber 1 |
| tundra | normal | classic | 3 | 100% | 0% | 0% | 15.0 | 49 | 0 | infantry 86, tank 55, artillery 37 |
| tundra | hard | classic | 3 | 100% | 0% | 0% | 15.0 | 45 | 0 | infantry 64, tank 41, artillery 31, bomber 3 |
| tundra | easy | modern | 3 | 100% | 0% | 0% | 15.0 | 47 | 6147 | infantry 75, tank 36, artillery 27, mech 14 |
| tundra | normal | modern | 3 | 100% | 0% | 0% | 15.0 | 50 | 4657 | infantry 64, artillery 35, tank 32, mech 18 |
| tundra | hard | modern | 3 | 100% | 0% | 0% | 15.0 | 48 | 6353 | infantry 63, tank 33, artillery 24, mech 12 |
| outpost | easy | classic | 3 | 0% | 100% | 0% | 21.0 | 23 | 0 | infantry 36, artillery 32, tank 29, antiAir 5 |
| outpost | normal | classic | 3 | 0% | 100% | 0% | 21.0 | 22 | 0 | artillery 34, tank 33, infantry 32, antiAir 5 |
| outpost | hard | classic | 3 | 0% | 100% | 0% | 21.0 | 22 | 0 | artillery 40, infantry 30, tank 23, antiAir 1 |
| outpost | easy | modern | 3 | 0% | 100% | 0% | 21.0 | 23 | 11773 | infantry 35, mech 23, tank 23, artillery 15 |
| outpost | normal | modern | 3 | 0% | 100% | 0% | 21.0 | 22 | 5113 | infantry 22, artillery 19, mech 18, tank 15 |
| outpost | hard | modern | 3 | 0% | 100% | 0% | 21.0 | 23 | 10750 | infantry 28, artillery 18, tank 18, mech 17 |
| marsh | easy | classic | 3 | 0% | 0% | 100% | — | 31 | 0 | infantry 93, tank 48, artillery 33, bomber 19 |
| marsh | normal | classic | 3 | 0% | 0% | 100% | — | 37 | 0 | infantry 77, artillery 68, tank 67, bomber 13 |
| marsh | hard | classic | 3 | 0% | 0% | 100% | — | 35 | 0 | infantry 61, tank 46, artillery 36, bomber 14 |
| marsh | easy | modern | 3 | 0% | 0% | 100% | — | 31 | 0 | infantry 36, artillery 15, mech 15, tank 14 |
| marsh | normal | modern | 3 | 0% | 0% | 100% | — | 33 | 0 | infantry 42, tank 27, artillery 18, mech 12 |
| marsh | hard | modern | 3 | 0% | 0% | 100% | — | 31 | 4200 | infantry 30, tank 20, artillery 15, mech 15 |
| admiralty | easy | modern | 3 | 0% | 0% | 100% | — | 59 | 45100 | infantry 86, tank 76, artillery 67, helicopter 25 |
| admiralty | normal | modern | 3 | 0% | 0% | 100% | — | 57 | 89827 | infantry 75, artillery 65, tank 56, destroyer 22 |
| admiralty | hard | modern | 3 | 0% | 0% | 100% | — | 56 | 104697 | infantry 73, artillery 46, tank 40, landingShip 29 |

最大部隊数は両陣営の合計（輸送中の部隊を含む）。修理費は近代ルールのみ（従来ルールの修理は無料のため 0）。

計測対象外:
- admiralty（classic）: 初期配置に近代ルール専用ユニット（mech）があるため、従来ルールでは計測できません。

## 詳細結果（難易度の違う対戦）


| マップ | 難易度 | ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ターン | 最大部隊数 | 平均修理費（近代） | 生産上位 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| skirmish | 赤 hard 対 青 easy | modern | 2 | 0% | 50% | 50% | 36.0 | 39 | 29700 | infantry 81, tank 45, artillery 33, mech 31 |
| siege | 赤 hard 対 青 easy | modern | 2 | 0% | 0% | 100% | — | 61 | 57195 | infantry 116, tank 71, artillery 64, mech 25 |
| canyon | 赤 hard 対 青 easy | modern | 2 | 0% | 0% | 100% | — | 54 | 25665 | infantry 137, tank 88, artillery 67, mech 20 |
| river | 赤 hard 対 青 easy | modern | 2 | 0% | 0% | 100% | — | 56 | 24870 | infantry 49, tank 28, artillery 27, destroyer 9 |
| marsh | 赤 hard 対 青 easy | modern | 2 | 0% | 0% | 100% | — | 33 | 13240 | infantry 39, artillery 17, mech 16, tank 15 |
| islands | 赤 hard 対 青 easy | modern | 2 | 0% | 0% | 100% | — | 19 | 35475 | mech 13, bomber 11, infantry 10, landingShip 7 |

最大部隊数は両陣営の合計（輸送中の部隊を含む）。修理費は近代ルールのみ（従来ルールの修理は無料のため 0）。

| skirmish | 赤 easy 対 青 hard | modern | 2 | 0% | 0% | 100% | — | 38 | 38490 | infantry 155, artillery 73, tank 65, mech 33 |
| siege | 赤 easy 対 青 hard | modern | 2 | 0% | 0% | 100% | — | 67 | 35445 | infantry 154, artillery 85, tank 82, mech 29 |
| canyon | 赤 easy 対 青 hard | modern | 2 | 0% | 0% | 100% | — | 54 | 25585 | infantry 131, artillery 71, tank 67, mech 25 |
| river | 赤 easy 対 青 hard | modern | 2 | 0% | 0% | 100% | — | 55 | 101635 | infantry 66, tank 57, artillery 51, destroyer 21 |
| marsh | 赤 easy 対 青 hard | modern | 2 | 0% | 0% | 100% | — | 36 | 5095 | infantry 30, tank 20, mech 19, helicopter 13 |
| islands | 赤 easy 対 青 hard | modern | 2 | 0% | 0% | 100% | — | 21 | 24290 | infantry 16, landingShip 12, tank 9, destroyer 8 |
