# 部隊数の上限と判定勝ちの効果測定 2026-09-27

対象: Issue #119（案A: ゲーム規則による決着の促進、案D: 決着理由の記録）。比較の基準は `2026-09-26-balance-baseline.md`（v2）と `2026-09-26-cpu-offense.md`（#118）。

## 結論

- **判定勝ちによって、全局が決着するようになった**: v3（今回）の未決着は **0%**。v2 は 63%、従来ルールは 56%。勝敗条件が全滅・司令部占領だけのマップ7種（63局）は、すべて判定で決着した。
- **ただし、決着は判定によるもので、制圧による勝利は増えていない**: これら63局はすべて、ラウンド40の終了時に判定で決まった。CPU が敵を制圧する力は、変わっていない（#119 の案B で扱う）。
- **判定では先手（赤）が勝ち越している**（39勝24敗）。赤の勝ち越しは、siege（9戦9勝）と admiralty（9戦8勝）に集中している。どちらも中央に中立の拠点がある。先手が先に取れる構造が、判定で表面化したと推測する。ほかのマップは結果がばらついている。
- **部隊数の上限は、CPU 対 CPU の結果には影響しない**: CPU は、#118 で入れた自身の上限（開けた土地の 25%）がルールの上限より小さいので、ルールの上限に達しない。ルールの上限が効くのは人間側だけ（計画レビューの指摘どおり）。

## 計測条件

- コミット: `024ce84`（`feature/119-decisive-rules`）
- コマンド: `npm run balance -- --rules classic,v2,modern --seeds 3 --rounds 60`（297局。従来ルールの admiralty は計測対象外。所要166秒）
- `modern` は、新規対局と同じ最新のルールバージョン（3）を指す。`v2` は #118 までの近代ルール。

## 結果（ルール別）

| ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ラウンド | 決着理由 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 従来ルール | 90 | 13 | 27 | 50（56%） | 21.0 | 生存 27、スコア 9、全滅 3、司令部占領 1 |
| v2 | 99 | 10 | 27 | 62（63%） | 18.1 | 生存 27、スコア 9、全滅 1 |
| **v3（今回）** | 99 | 49 | 50 | **0（0%）** | 32.3 | **判定 63**、生存 27、スコア 9 |

### 判定勝ちの対象マップ7種（v3、各難易度 × 3シード）

| マップ | 赤勝 | 青勝 |
| --- | ---: | ---: |
| skirmish | 3 | 6 |
| islands | 4 | 5 |
| canyon | 5 | 4 |
| siege | 9 | 0 |
| river | 4 | 5 |
| marsh | 6 | 3 |
| admiralty | 8 | 1 |
| **合計** | **39** | **24** |

## 残る課題

1. **制圧による決着が無い**: 判定は時間切れの決着でしかない。#119 の案B（CPU の難易度の再設計）と、案C（隘路の突破）が引き続き必要。
2. **中央の中立拠点がある対称マップでは、先手が有利**: siege と admiralty。対策として次を検討する（#116 の 10.4 と一体で）。
   - 後手の初期資金の補正
   - 中立拠点の配置の見直し
   - 判定での同数処理を後手有利にする
3. **判定ラウンド（40）の妥当性**: 今は一律の値にしている。盤面の大きさに合わせるかどうかは、人間のプレイで確認してから判断する。

## 詳細結果

計測条件: 最大 60 ラウンド、シード 3 種（7919, 15838, 23757）、所要 166 秒

| マップ | 難易度 | ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ターン | 決着理由 | 最大部隊数 | 平均修理費（近代） | 生産上位 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| skirmish | easy | classic | 3 | 0% | 100% | 0% | 48.7 | eliminate 3 | 38 | 0 | infantry 125, tank 94, artillery 86, antiAir 11 |
| skirmish | normal | classic | 3 | 33% | 0% | 67% | 40.0 | captureCapital 1 | 38 | 0 | infantry 164, tank 110, artillery 104, antiAir 6 |
| skirmish | hard | classic | 3 | 0% | 0% | 100% | — | — | 38 | 0 | infantry 189, tank 156, artillery 129, antiAir 6 |
| skirmish | easy | v2 | 3 | 0% | 33% | 67% | 57.0 | eliminate 1 | 38 | 56670 | infantry 160, artillery 77, tank 75, mech 47 |
| skirmish | normal | v2 | 3 | 0% | 0% | 100% | — | — | 39 | 45877 | infantry 141, artillery 82, tank 82, mech 36 |
| skirmish | hard | v2 | 3 | 0% | 0% | 100% | — | — | 39 | 54140 | infantry 143, tank 107, artillery 99, mech 39 |
| skirmish | easy | modern | 3 | 0% | 100% | 0% | 41.0 | decision 3 | 38 | 28983 | infantry 126, artillery 63, tank 56, mech 37 |
| skirmish | normal | modern | 3 | 33% | 67% | 0% | 41.0 | decision 3 | 39 | 24627 | infantry 112, artillery 56, tank 53, mech 30 |
| skirmish | hard | modern | 3 | 67% | 33% | 0% | 41.0 | decision 3 | 39 | 24200 | infantry 110, tank 71, artillery 64, mech 31 |
| islands | easy | classic | 3 | 0% | 0% | 100% | — | — | 19 | 0 | bomber 20, fighter 18, infantry 18, artillery 12 |
| islands | normal | classic | 3 | 0% | 0% | 100% | — | — | 18 | 0 | infantry 18, artillery 9, landingShip 9, tank 9 |
| islands | hard | classic | 3 | 0% | 0% | 100% | — | — | 17 | 0 | infantry 18, tank 12, artillery 9, landingShip 9 |
| islands | easy | v2 | 3 | 0% | 0% | 100% | — | — | 21 | 51173 | bomber 30, landingShip 19, fighter 18, helicopter 14 |
| islands | normal | v2 | 3 | 0% | 0% | 100% | — | — | 19 | 15847 | infantry 46, landingShip 14, mech 12, antiAir 6 |
| islands | hard | v2 | 3 | 0% | 0% | 100% | — | — | 19 | 10103 | infantry 21, landingShip 14, mech 9, tank 9 |
| islands | easy | modern | 3 | 0% | 100% | 0% | 41.0 | decision 3 | 19 | 37047 | bomber 21, infantry 14, mech 13, landingShip 10 |
| islands | normal | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 19 | 8473 | infantry 25, landingShip 12, mech 12, antiAir 6 |
| islands | hard | modern | 3 | 33% | 67% | 0% | 41.0 | decision 3 | 19 | 8393 | infantry 12, landingShip 10, mech 9, tank 7 |
| landing | easy | classic | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 19 | 0 | infantry 18, artillery 12, tank 12, destroyer 3 |
| landing | normal | classic | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 18 | 0 | infantry 18, artillery 12, tank 12 |
| landing | hard | classic | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 18 | 0 | infantry 18, tank 15, artillery 12, landingShip 3 |
| landing | easy | v2 | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 21 | 0 | infantry 15, mech 11, artillery 9, tank 9 |
| landing | normal | v2 | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 21 | 0 | infantry 18, artillery 12, tank 9, mech 6 |
| landing | hard | v2 | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 19 | 0 | infantry 15, artillery 9, mech 9, tank 9 |
| landing | easy | modern | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 21 | 0 | infantry 15, mech 11, artillery 9, tank 9 |
| landing | normal | modern | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 21 | 0 | infantry 18, artillery 12, tank 9, mech 6 |
| landing | hard | modern | 3 | 0% | 100% | 0% | 19.0 | survive 3 | 19 | 0 | infantry 15, artillery 9, mech 9, tank 9 |
| canyon | easy | classic | 3 | 0% | 0% | 100% | — | — | 54 | 0 | infantry 270, tank 147, artillery 133, antiAir 13 |
| canyon | normal | classic | 3 | 0% | 0% | 100% | — | — | 55 | 0 | infantry 198, tank 118, artillery 112, antiAir 13 |
| canyon | hard | classic | 3 | 0% | 0% | 100% | — | — | 54 | 0 | infantry 137, artillery 96, tank 93, bomber 7 |
| canyon | easy | v2 | 3 | 0% | 0% | 100% | — | — | 54 | 15187 | infantry 216, artillery 96, tank 93, helicopter 39 |
| canyon | normal | v2 | 3 | 0% | 0% | 100% | — | — | 55 | 8863 | infantry 166, artillery 89, tank 80, helicopter 28 |
| canyon | hard | v2 | 3 | 0% | 0% | 100% | — | — | 55 | 12227 | infantry 110, artillery 86, tank 84, mech 20 |
| canyon | easy | modern | 3 | 67% | 33% | 0% | 41.0 | decision 3 | 54 | 8400 | infantry 152, artillery 76, tank 56, helicopter 30 |
| canyon | normal | modern | 3 | 33% | 67% | 0% | 41.0 | decision 3 | 54 | 5143 | infantry 144, artillery 75, tank 56, helicopter 23 |
| canyon | hard | modern | 3 | 67% | 33% | 0% | 41.0 | decision 3 | 55 | 9410 | infantry 99, artillery 73, tank 64, mech 18 |
| siege | easy | classic | 3 | 0% | 0% | 100% | — | — | 52 | 0 | infantry 195, tank 157, artillery 134, antiAir 12 |
| siege | normal | classic | 3 | 0% | 0% | 100% | — | — | 67 | 0 | infantry 244, tank 177, artillery 161, antiAir 11 |
| siege | hard | classic | 3 | 0% | 0% | 100% | — | — | 65 | 0 | infantry 203, tank 181, artillery 159, antiAir 10 |
| siege | easy | v2 | 3 | 0% | 0% | 100% | — | — | 54 | 31170 | infantry 199, tank 106, artillery 99, mech 53 |
| siege | normal | v2 | 3 | 0% | 0% | 100% | — | — | 58 | 48210 | infantry 182, artillery 141, tank 120, mech 30 |
| siege | hard | v2 | 3 | 0% | 0% | 100% | — | — | 65 | 49550 | infantry 229, tank 153, artillery 150, mech 40 |
| siege | easy | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 54 | 14940 | infantry 155, artillery 83, tank 78, mech 34 |
| siege | normal | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 58 | 30843 | infantry 146, artillery 99, tank 82, mech 24 |
| siege | hard | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 65 | 22723 | infantry 181, artillery 104, tank 93, mech 30 |
| river | easy | classic | 3 | 0% | 0% | 100% | — | — | 55 | 0 | infantry 151, tank 111, artillery 73, landingShip 48 |
| river | normal | classic | 3 | 0% | 0% | 100% | — | — | 56 | 0 | infantry 84, artillery 72, tank 62, destroyer 34 |
| river | hard | classic | 3 | 0% | 0% | 100% | — | — | 55 | 0 | infantry 78, destroyer 52, artillery 39, tank 30 |
| river | easy | v2 | 3 | 0% | 0% | 100% | — | — | 56 | 64840 | infantry 110, tank 78, artillery 63, bomber 21 |
| river | normal | v2 | 3 | 0% | 0% | 100% | — | — | 57 | 90837 | infantry 70, artillery 58, tank 51, destroyer 33 |
| river | hard | v2 | 3 | 0% | 0% | 100% | — | — | 54 | 5600 | infantry 72, tank 33, artillery 27, mech 12 |
| river | easy | modern | 3 | 33% | 67% | 0% | 41.0 | decision 3 | 56 | 36457 | infantry 85, tank 48, artillery 39, landingShip 20 |
| river | normal | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 57 | 31870 | infantry 66, artillery 41, tank 39, destroyer 24 |
| river | hard | modern | 3 | 0% | 100% | 0% | 41.0 | decision 3 | 54 | 5600 | infantry 72, tank 30, artillery 27, mech 12 |
| industrial | easy | classic | 3 | 67% | 33% | 0% | 12.3 | score 3 | 52 | 0 | infantry 90, tank 30, artillery 28 |
| industrial | normal | classic | 3 | 33% | 67% | 0% | 18.7 | score 3 | 58 | 0 | infantry 84, artillery 47, tank 42 |
| industrial | hard | classic | 3 | 0% | 100% | 0% | 22.3 | score 3 | 63 | 0 | infantry 83, artillery 65, tank 47 |
| industrial | easy | v2 | 3 | 33% | 67% | 0% | 16.7 | score 3 | 66 | 357 | infantry 102, tank 34, artillery 33, mech 12 |
| industrial | normal | v2 | 3 | 0% | 100% | 0% | 11.0 | score 3 | 49 | 1150 | infantry 84, artillery 19, tank 18, mech 12 |
| industrial | hard | v2 | 3 | 0% | 100% | 0% | 12.0 | score 3 | 56 | 2903 | infantry 87, tank 24, artillery 22, mech 12 |
| industrial | easy | modern | 3 | 33% | 67% | 0% | 16.7 | score 3 | 66 | 357 | infantry 102, tank 34, artillery 33, mech 12 |
| industrial | normal | modern | 3 | 0% | 100% | 0% | 11.0 | score 3 | 49 | 1150 | infantry 84, artillery 19, tank 18, mech 12 |
| industrial | hard | modern | 3 | 0% | 100% | 0% | 12.0 | score 3 | 56 | 2903 | infantry 87, tank 24, artillery 22, mech 12 |
| tundra | easy | classic | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 44 | 0 | infantry 68, tank 50, artillery 44, bomber 1 |
| tundra | normal | classic | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 49 | 0 | infantry 86, tank 55, artillery 37 |
| tundra | hard | classic | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 45 | 0 | infantry 64, tank 41, artillery 31, bomber 3 |
| tundra | easy | v2 | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 47 | 6207 | infantry 70, tank 36, artillery 29, mech 14 |
| tundra | normal | v2 | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 50 | 4657 | infantry 64, artillery 35, tank 32, mech 18 |
| tundra | hard | v2 | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 48 | 6353 | infantry 63, tank 33, artillery 24, mech 12 |
| tundra | easy | modern | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 47 | 6207 | infantry 70, tank 36, artillery 29, mech 14 |
| tundra | normal | modern | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 50 | 4657 | infantry 64, artillery 35, tank 32, mech 18 |
| tundra | hard | modern | 3 | 100% | 0% | 0% | 15.0 | survive 3 | 48 | 6353 | infantry 63, tank 33, artillery 24, mech 12 |
| outpost | easy | classic | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 23 | 0 | infantry 36, artillery 32, tank 29, antiAir 5 |
| outpost | normal | classic | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 22 | 0 | artillery 34, tank 33, infantry 32, antiAir 5 |
| outpost | hard | classic | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 22 | 0 | artillery 40, infantry 30, tank 23, antiAir 1 |
| outpost | easy | v2 | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 23 | 11773 | infantry 35, mech 23, tank 23, artillery 15 |
| outpost | normal | v2 | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 22 | 5113 | infantry 22, artillery 19, mech 18, tank 15 |
| outpost | hard | v2 | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 23 | 10617 | infantry 27, tank 18, mech 17, artillery 16 |
| outpost | easy | modern | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 23 | 11773 | infantry 35, mech 23, tank 23, artillery 15 |
| outpost | normal | modern | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 22 | 5313 | infantry 22, artillery 19, mech 18, tank 15 |
| outpost | hard | modern | 3 | 0% | 100% | 0% | 21.0 | survive 3 | 23 | 10617 | infantry 27, tank 18, mech 17, artillery 16 |
| marsh | easy | classic | 3 | 0% | 0% | 100% | — | — | 31 | 0 | infantry 93, tank 48, artillery 33, bomber 19 |
| marsh | normal | classic | 3 | 0% | 0% | 100% | — | — | 37 | 0 | infantry 77, artillery 68, tank 67, bomber 13 |
| marsh | hard | classic | 3 | 0% | 0% | 100% | — | — | 35 | 0 | infantry 61, tank 46, artillery 36, bomber 14 |
| marsh | easy | v2 | 3 | 0% | 0% | 100% | — | — | 31 | 0 | infantry 36, artillery 15, mech 15, tank 14 |
| marsh | normal | v2 | 3 | 0% | 0% | 100% | — | — | 33 | 0 | infantry 42, tank 27, artillery 18, mech 12 |
| marsh | hard | v2 | 3 | 0% | 0% | 100% | — | — | 31 | 4200 | infantry 30, tank 20, artillery 15, mech 15 |
| marsh | easy | modern | 3 | 0% | 100% | 0% | 41.0 | decision 3 | 31 | 0 | infantry 36, artillery 15, mech 15, tank 14 |
| marsh | normal | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 33 | 0 | infantry 42, tank 27, artillery 18, mech 12 |
| marsh | hard | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 31 | 4200 | infantry 30, tank 20, artillery 15, mech 15 |
| admiralty | easy | v2 | 3 | 0% | 0% | 100% | — | — | 59 | 45100 | infantry 86, tank 76, artillery 67, helicopter 25 |
| admiralty | normal | v2 | 3 | 0% | 0% | 100% | — | — | 57 | 89827 | infantry 75, artillery 65, tank 56, destroyer 22 |
| admiralty | hard | v2 | 3 | 0% | 0% | 100% | — | — | 56 | 104697 | infantry 73, artillery 46, tank 40, landingShip 29 |
| admiralty | easy | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 59 | 20460 | infantry 66, tank 51, artillery 47, mech 14 |
| admiralty | normal | modern | 3 | 67% | 33% | 0% | 41.0 | decision 3 | 57 | 36087 | infantry 72, artillery 48, tank 40, helicopter 10 |
| admiralty | hard | modern | 3 | 100% | 0% | 0% | 41.0 | decision 3 | 56 | 49627 | infantry 72, artillery 43, tank 33, landingShip 19 |

最大部隊数は両陣営の合計（輸送中の部隊を含む）。修理費は近代ルールのみ（従来ルールの修理は無料のため 0）。

計測対象外:
- admiralty（classic）: 初期配置に近代ルール専用ユニット（mech）があるため、従来ルールでは計測できません。
