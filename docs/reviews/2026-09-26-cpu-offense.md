# CPU 攻勢強化の効果測定 2026-09-26

対象: Issue #116 Phase 10.2。比較対象はベースライン（`2026-09-26-balance-baseline.md`）。

## 計測条件

- コミット: `252fa30`（`feature/116-cpu-offense`）
- コマンド: `npm run balance -- --seeds 3 --rounds 60`（ベースラインと同じ条件。計測対象は189局、所要109秒）

## 変更内容（`src/ai/rules.ts`）

1. **生産施設の居座り防止**: 自軍の生産施設の上で手番を終えると、評価を下げる（-45。★3 施設の防御補正を上回る値）。補給が必要な部隊と、HP 50 以下の部隊は対象外。
2. **集中攻撃**: 攻撃対象を選ぶとき、撃破が確実な敵を優先する。
3. **膠着時の攻勢**: 21ラウンド目以降、見えている敵の反撃リスクの重みを徐々に下げる（最大 60%）。攻撃の条件も最大 15 点緩める。判断には公開情報であるラウンド数だけを使う。
4. **補給車の配置**（近代ルール）: 補給が必要な自軍の地上部隊の隣を高く評価する。
5. **生産の上限**: 自軍の部隊数が、海と山を除いたマス数の 25%（最低 8）に達したら生産を控える。
6. **拠点の守備隊の排除**: 占領が必要な拠点の上にいる敵には、不利な交換でも攻撃する（司令部 +30、その他の拠点 +15 の許容）。
7. **不具合の修正**: `needsSupply` が、弾薬が 0 の武装ユニットを補給対象から外していた。

## 結果

| 指標 | ベースライン | 10.2 適用後 |
| --- | ---: | ---: |
| 未決着（全189局） | 110局（58%） | 104局（55%） |
| 未決着（勝敗条件が全滅・司令部占領だけのマップ7種、117局） | 110局（94%） | 104局（89%） |
| 上記マップで制圧により決着した局数 | 7 | 13 |
| hard の平均の最大部隊数 | 19 | 41 |
| 従来ルールの未決着 | 56% | 50% |

「勝敗条件が全滅・司令部占領だけのマップ」は skirmish / islands / canyon / siege / river / marsh / admiralty の7種。landing・outpost・industrial・tundra は、ターン制限・生存・スコアの条件で決着するため除いた。

### 途中で判明したこと

- **生産の詰まりを解消しただけでは、盤面が渋滞する**: 変更1〜4だけの段階では、平均の最大部隊数が 35 から 62 に増えた一方、未決着は 60% のままだった。canyon（近代ルール、normal）では、60ラウンド目に通行可能な111マスのうち93マスが部隊で埋まり、30ラウンド目以降の行動の大半が「待機」（2151回。移動は343回）だった。この対策として変更5を加えた。
- **包囲が膠着する**: 敵の司令部を包囲しても、防御 ★4 の上で毎ターン回復する守備隊を「不利な交換」と判断して攻撃しないため、包囲が永久に続いていた。この対策として変更6を加えた。

## 残る課題（次のステップへ）

1. **難易度の強さが逆転している（最優先）**: 近代ルールで、異なる難易度どうしを対戦させた。6マップ × 陣営の入れ替え × 2シードの計24局で、結果は次のとおり。
   - hard 対 easy: 修正前・修正後とも hard 0勝・easy 2勝・未決着22
   - normal 対 easy: 修正後で 0勝・0勝・未決着24

   距離・脅威・地形の重みを変えてみても、改善しなかった。重みの調整ではなく、難易度の設計そのもの（読みの深さや連携攻撃など）を見直す必要がある。現在のハーネスは両陣営が同じ難易度しか扱えないので、陣営ごとに難易度を指定する機能をハーネスに追加する必要がある。
2. **通り道の狭いマップの膠着**: canyon・river・islands・marsh・admiralty は、修正後も全組み合わせで未決着だった。同じ CPU どうしの対戦ではこれらの隘路を突破できないので、連携攻撃（複数部隊で同じ目標を叩く、間接攻撃部隊と観測役の連携）が必要。マップ側の調整（10.4）も候補になる。
3. **決着理由の記録**: ハーネスは決着の理由（全滅・司令部占領・ターン制限など）を記録していない。10.3 以降の評価のために記録するようにする。

## 詳細結果

計測条件: 最大 60 ラウンド、シード 3 種（7919, 15838, 23757）、所要 109 秒

| マップ | 難易度 | ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ターン | 最大部隊数 | 平均修理費（近代） | 生産上位 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| skirmish | easy | classic | 3 | 0% | 100% | 0% | 47.7 | 37 | 0 | infantry 158, tank 98, artillery 88, antiAir 6 |
| skirmish | normal | classic | 3 | 33% | 0% | 67% | 51.0 | 38 | 0 | infantry 199, tank 145, artillery 141, antiAir 3 |
| skirmish | hard | classic | 3 | 0% | 33% | 67% | 42.0 | 38 | 0 | infantry 167, tank 124, artillery 106, antiAir 5 |
| skirmish | easy | modern | 3 | 0% | 100% | 0% | 45.7 | 38 | 36953 | infantry 99, tank 49, artillery 47, mech 40 |
| skirmish | normal | modern | 3 | 33% | 0% | 67% | 51.0 | 38 | 42823 | infantry 167, artillery 84, tank 77, mech 55 |
| skirmish | hard | modern | 3 | 0% | 0% | 100% | — | 38 | 67487 | infantry 217, tank 111, artillery 105, mech 51 |
| islands | easy | classic | 3 | 0% | 0% | 100% | — | 16 | 0 | infantry 20, tank 12, artillery 8, landingShip 8 |
| islands | normal | classic | 3 | 0% | 0% | 100% | — | 16 | 0 | infantry 18, antiAir 6, artillery 6, bomber 6 |
| islands | hard | classic | 3 | 0% | 0% | 100% | — | 16 | 0 | infantry 15, landingShip 11, tank 10, artillery 7 |
| islands | easy | modern | 3 | 0% | 0% | 100% | — | 16 | 21940 | landingShip 15, mech 15, infantry 10, antiAir 8 |
| islands | normal | modern | 3 | 0% | 0% | 100% | — | 16 | 1467 | infantry 9, landingShip 9, mech 9, tank 6 |
| islands | hard | modern | 3 | 0% | 0% | 100% | — | 16 | 12800 | landingShip 17, mech 17, infantry 9, tank 9 |
| landing | easy | classic | 3 | 0% | 100% | 0% | 19.0 | 18 | 0 | infantry 18, artillery 12, tank 12 |
| landing | normal | classic | 3 | 0% | 100% | 0% | 19.0 | 18 | 0 | infantry 18, artillery 12, tank 12 |
| landing | hard | classic | 3 | 0% | 100% | 0% | 19.0 | 18 | 0 | infantry 18, artillery 12, tank 12 |
| landing | easy | modern | 3 | 0% | 100% | 0% | 19.0 | 18 | 247 | infantry 15, artillery 9, mech 8, helicopter 6 |
| landing | normal | modern | 3 | 0% | 100% | 0% | 19.0 | 18 | 1787 | infantry 15, artillery 9, helicopter 8, mech 7 |
| landing | hard | modern | 3 | 0% | 100% | 0% | 19.0 | 18 | 4923 | infantry 15, artillery 9, helicopter 8, mech 6 |
| canyon | easy | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 268, tank 137, artillery 136, bomber 13 |
| canyon | normal | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 185, tank 103, artillery 97, fighter 17 |
| canyon | hard | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 130, tank 100, artillery 99, bomber 13 |
| canyon | easy | modern | 3 | 0% | 0% | 100% | — | 54 | 24657 | infantry 240, tank 99, artillery 92, mech 38 |
| canyon | normal | modern | 3 | 0% | 0% | 100% | — | 54 | 10400 | infantry 142, artillery 84, tank 76, helicopter 27 |
| canyon | hard | modern | 3 | 0% | 0% | 100% | — | 54 | 19887 | infantry 127, artillery 64, tank 61, helicopter 24 |
| siege | easy | classic | 3 | 67% | 0% | 33% | 55.0 | 51 | 0 | infantry 210, tank 156, artillery 133, antiAir 13 |
| siege | normal | classic | 3 | 0% | 33% | 67% | 47.0 | 59 | 0 | infantry 186, artillery 154, tank 144, antiAir 14 |
| siege | hard | classic | 3 | 0% | 0% | 100% | — | 66 | 0 | infantry 187, artillery 162, tank 161, antiAir 13 |
| siege | easy | modern | 3 | 0% | 0% | 100% | — | 61 | 38710 | infantry 231, tank 143, artillery 116, mech 55 |
| siege | normal | modern | 3 | 0% | 0% | 100% | — | 60 | 43797 | infantry 204, artillery 127, tank 121, mech 32 |
| siege | hard | modern | 3 | 0% | 0% | 100% | — | 65 | 49973 | infantry 168, artillery 124, tank 103, mech 39 |
| river | easy | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 137, tank 89, artillery 77, destroyer 42 |
| river | normal | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 100, tank 88, artillery 78, destroyer 30 |
| river | hard | classic | 3 | 0% | 0% | 100% | — | 54 | 0 | infantry 80, tank 43, artillery 40, destroyer 21 |
| river | easy | modern | 3 | 0% | 0% | 100% | — | 54 | 113883 | infantry 135, tank 76, artillery 67, destroyer 30 |
| river | normal | modern | 3 | 0% | 0% | 100% | — | 54 | 42427 | infantry 72, tank 42, artillery 40, destroyer 36 |
| river | hard | modern | 3 | 0% | 0% | 100% | — | 54 | 26070 | infantry 72, tank 34, artillery 29, landingShip 18 |
| industrial | easy | classic | 3 | 0% | 100% | 0% | 16.7 | 63 | 0 | infantry 114, artillery 40, tank 35, bomber 3 |
| industrial | normal | classic | 3 | 67% | 33% | 0% | 14.7 | 57 | 0 | infantry 89, artillery 41, tank 32 |
| industrial | hard | classic | 3 | 100% | 0% | 0% | 15.3 | 48 | 0 | infantry 66, artillery 48, tank 27 |
| industrial | easy | modern | 3 | 0% | 100% | 0% | 26.3 | 68 | 810 | infantry 100, artillery 36, tank 26, mech 14 |
| industrial | normal | modern | 3 | 0% | 100% | 0% | 20.0 | 68 | 1190 | infantry 106, artillery 34, tank 27, mech 13 |
| industrial | hard | modern | 3 | 33% | 67% | 0% | 15.3 | 63 | 2513 | infantry 103, artillery 31, tank 29, mech 12 |
| tundra | easy | classic | 3 | 100% | 0% | 0% | 15.0 | 49 | 0 | infantry 84, tank 54, artillery 38, antiAir 2 |
| tundra | normal | classic | 3 | 100% | 0% | 0% | 15.0 | 46 | 0 | infantry 79, artillery 52, tank 47 |
| tundra | hard | classic | 3 | 100% | 0% | 0% | 15.0 | 43 | 0 | infantry 65, tank 44, artillery 40 |
| tundra | easy | modern | 3 | 100% | 0% | 0% | 15.0 | 49 | 3947 | infantry 67, tank 35, artillery 30, mech 15 |
| tundra | normal | modern | 3 | 100% | 0% | 0% | 15.0 | 49 | 4160 | infantry 63, artillery 32, tank 27, mech 19 |
| tundra | hard | modern | 3 | 100% | 0% | 0% | 15.0 | 44 | 1620 | infantry 51, artillery 42, tank 18, mech 15 |
| outpost | easy | classic | 3 | 0% | 100% | 0% | 21.0 | 22 | 0 | infantry 48, tank 38, artillery 35, antiAir 3 |
| outpost | normal | classic | 3 | 0% | 100% | 0% | 21.0 | 22 | 0 | infantry 41, tank 36, artillery 35, bomber 2 |
| outpost | hard | classic | 3 | 0% | 100% | 0% | 21.0 | 22 | 0 | infantry 37, artillery 31, tank 24, bomber 3 |
| outpost | easy | modern | 3 | 0% | 100% | 0% | 21.0 | 22 | 17207 | infantry 45, mech 24, artillery 15, tank 15 |
| outpost | normal | modern | 3 | 0% | 100% | 0% | 21.0 | 22 | 9113 | infantry 26, artillery 20, mech 17, tank 16 |
| outpost | hard | modern | 3 | 0% | 100% | 0% | 21.0 | 22 | 15433 | infantry 24, tank 22, artillery 19, mech 16 |
| marsh | easy | classic | 3 | 33% | 0% | 67% | 58.0 | 30 | 0 | infantry 116, tank 57, artillery 40, bomber 12 |
| marsh | normal | classic | 3 | 0% | 0% | 100% | — | 37 | 0 | infantry 65, tank 45, artillery 35, bomber 9 |
| marsh | hard | classic | 3 | 0% | 0% | 100% | — | 35 | 0 | infantry 69, artillery 44, tank 44, bomber 6 |
| marsh | easy | modern | 3 | 0% | 0% | 100% | — | 34 | 1387 | infantry 59, tank 29, artillery 25, helicopter 16 |
| marsh | normal | modern | 3 | 0% | 0% | 100% | — | 35 | 347 | infantry 44, tank 25, artillery 16, helicopter 15 |
| marsh | hard | modern | 3 | 0% | 0% | 100% | — | 34 | 2167 | infantry 36, artillery 24, tank 24, mech 18 |
| admiralty | easy | modern | 3 | 0% | 0% | 100% | — | 54 | 58917 | infantry 74, artillery 60, tank 52, destroyer 34 |
| admiralty | normal | modern | 3 | 0% | 0% | 100% | — | 54 | 54270 | infantry 88, artillery 65, tank 56, destroyer 31 |
| admiralty | hard | modern | 3 | 0% | 0% | 100% | — | 54 | 59777 | infantry 72, artillery 64, tank 59, destroyer 20 |

最大部隊数は両陣営の合計（輸送中の部隊を含む）。修理費は近代ルールのみ（従来ルールの修理は無料のため 0）。

計測対象外:
- admiralty（classic）: 初期配置に近代ルール専用ユニット（mech）があるため、従来ルールでは計測できません。
