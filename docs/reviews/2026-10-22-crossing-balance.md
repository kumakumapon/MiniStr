# 仮設橋・生成戦域・渡河作戦の評価（2026-10-22 UTC）

対象: [PR #222](https://github.com/kumakumapon/MiniStr/pull/222)。実装コードは `34877d01958a545af5c52470db0bc5e8dc56325a`。基準はv0.9.0の `c3e6dd9`。リリース番号は未決定。

## 再現性と集計範囲

ゲーム／AIソースのSHA256は `e15a89c09e2cfb47a1907844310386e398edae849a7e826d05bce6c4e4d7967b`。各JSONLのヘッダーに実行時のrevision、dirty、ソース・スクリプトのdigest、seed、上限を残した。実装コミット前の計測は設計コミット `4c5692e` とdirty=trueを記録しており、この実装コードのdigestと照合する。生成比較は別の既存ハッシュ方式で `b725a14b72fb40ef88f3b7834869d3bc73570f77837e3017254ba7a13e9a1eb8`。

最大60ラウンド、片軍1手番120命令、有限の実行時間で計測した。不正CPU命令・命令上限超過は勝敗として扱わずエラーにする。回転は陣営を交換せず地形と配置を180度回す。常に赤が先手。配置方向、seed、難易度の組合せを対応条件として扱い、回転・再実行を独立した人間対局の標本数とは解釈しない。

`bridgePassages` は地上移動の到着点が「同じ状態から橋だけを除いた場合、その手番に到達不能」だった命令数で、橋に依存した移動の下限指標。全通過人数や渋滞時間ではない。`depotCoveredRefills` も補給所圏内で補給された部隊数で、他の補給源との重複を含む。`maxOrderMs` はこのローカル環境での最大CPU命令計算時間で、実機の性能保証ではない。

## 新作戦の調整

初期試作は橋頭堡を3ターン保持、撤退出口が遠く、橋建設後の工兵が入口に残った。調整seed 1/7919、2方向、easy/easy・normal/normal・hard/hard・hard/normal・normal/hardの各20条件で確認した。

| 作戦 | 初期試作の赤／青 | 最終調整条件の赤／青 | 採用した改善 |
| --- | --- | --- | --- |
| 橋頭堡 | 6／14（青期限勝ち2） | 12／8（全て保持決着） | 2ターン保持、橋と岸の待機部隊を退かす |
| 撤退 | 2／18 | 3／17 | 出口を橋に近づけ、敵初期配置を2マス後退、橋の入口を空ける |

青軍補償0Gの試作では橋頭堡が赤6／青14で改善せず、2000Gを維持した。撤退は元から0G。建設費1000G、各軍2か所は維持した。

初期試作の[全40条件](crossing-2026-10-22/exploration.jsonl)は途中の未コミット実装の探索記録で、完全な過去ソースの復元用ではない。[最終調整40条件](crossing-2026-10-22/tune.jsonl)と以下の確認条件は実装コミットのゲーム／AIと一致する。

### 調整に使わなかった戦闘seedでの確認

seed 23757/31676、上と同じ2方向・5難易度組合せの[40条件](crossing-2026-10-22/verify.jsonl)。全件合法に決着し、全条件で橋の建設が起きた。

| 赤CPU／青CPU | 橋頭堡 赤／青 | 撤退 赤／青 |
| --- | --- | --- |
| easy／easy | 2／2 | 0／4 |
| normal／normal | 0／4 | 1／3 |
| hard／hard | 3／1 | 1／3 |
| hard／normal | 3／1 | 2／2 |
| normal／hard | 2／2 | 0／4 |
| 合計 | 10／10 | 4／16 |

- 橋頭堡は5～32ターン、橋40本、橋に依存する移動370件、陣地58回、補給所圏内補給297件。最大CPU計算39ms。
- 撤退は7～13ターン、橋22本、橋に依存する移動101件、陣地41回、補給所圏内補給111件。最大CPU計算93ms。
- 撤退は目的が非対称で、対象喪失で即敗北する難度の高い作戦。CPU同士で赤勝率50%を目標にした調整ではない。橋頭堡も期限失敗の扱いが非対称。集計だけで人間に公平・適切な難度とは判断しない。

## 生成マップ

同一の生成・戦闘seedで標準v2と前線v3を比較。3サイズ（16/20/24）×3海域（none/coast/ocean）×2seed（crossing-verify-3/4）×2方向×同難易度3種類×2設定の[216条件](crossing-2026-10-22/generated-verify.jsonl)を完走した。初期の探索用seed frontier-1/2とは分離している。補償は全て2000G。

| 設定 | easy 赤／青 | normal 赤／青 | hard 赤／青 | 全体 赤／青 | 期限の戦力判定 |
| --- | --- | --- | --- | --- | --- |
| 標準v2 | 21／15 | 18／18 | 20／16 | 59／49 | 38／108 |
| 前線v3 | 21／15 | 19／17 | 17／19 | 57／51 | 38／108 |

未決着は0。ターン値61は60ラウンド終了の戦力判定であり、撃破や占領による早期決着とは区別する。前線v3は通常方向28／26、回転29／25。全体の差は小さくても条件別には偏りが残る。

| 前線v3 | 陸域のみ 赤／青 | 沿岸 赤／青 | 外洋 赤／青 |
| --- | --- | --- | --- |
| 16 | 5／7 | 6／6 | 9／3 |
| 20 | 3／9 | 6／6 | 5／7 |
| 24 | 4／8 | 7／5 | 12／0 |

24・外洋では同条件の標準v2は7／5に対し前線v3は12／0となった。[補償3000G・4000Gの24条件](crossing-2026-10-22/generated-bonus.jsonl)を試したが、各11／1で偏りは残った。追加資金だけの改善根拠が弱く、他条件への悪化も未評価のため、生成設定全体の補償を増やさず2000Gを維持した。次の評価では施設の位置と海陸部隊のCPU判断を切り分ける。

さらに未使用の生成seed crossing-confirm-5/6で24・外洋の[24条件](crossing-2026-10-22/generated-confirm.jsonl)を追加確認した。標準v2は赤9／青3、前線v3は赤5／青7。最初の2seedと逆向きになり、seed依存が強い。少数seedの集計で恒常的な優劣を断定せず、条件別の記録を残す。

## 既存作戦とキャンペーン

- [全11単体作戦](crossing-2026-10-22/operations.jsonl)を作者seed、赤hard／青easyで合法攻略。新作戦は橋頭堡14ターン・撤退5ターン。規定ターン16／12を満たす。自動テストで編成受入、合法履歴からの戦績登録・追加チャレンジ・読込も確認した。
- 既存補給2作戦の[変更前v8](crossing-2026-10-22/existing-v8.jsonl)と[変更後v9](crossing-2026-10-22/existing-v9.jsonl)は40条件すべてで計算時間以外の結果が一致した。
- [キャンペーン比較30条件](crossing-2026-10-22/campaign-compare.json)はnormal勝利による進行・支援・経験値を各章へ持ち込み、その同じ配置でeasy/normal/hardを比較した。easy10勝、normal10勝、hard7勝3敗。hardの敗北はskirmish・river・outpostの期限切れ。hardのみで全章を進行できた記録ではない。別途、全章easy進行・normal進行の既存回帰テストも成功した。

## 再実行

```sh
# GitをNodeの子プロセスから呼べる通常環境ではrevision/dirtyの上書き不要
npx vite-node scripts/crossing-balance.ts --phase tune --output /tmp/crossing-tune.jsonl
npx vite-node scripts/crossing-balance.ts --phase verify --output /tmp/crossing-verify.jsonl
npx vite-node scripts/crossing-balance.ts --phase regression --output /tmp/crossing-operations.jsonl
npm run balance:compare -- --generated --sizes 16,20,24 --seas none,coast,ocean --seeds crossing-verify-3,crossing-verify-4 --damage-seeds scenario --orientations normal,rotated --matchups easy:easy,normal:normal,hard:hard --variants seeded,frontline --bonuses 2000 --rule 9 --max-games 216 --seconds 600 --output /tmp/crossing-generated.jsonl
npm run campaign:playthrough -- compare /tmp/crossing-campaign
```

実行環境のNode子プロセス制限により、計測では確認済みrevisionを環境変数SIMULATION_REVISION/GITHUB_SHAへ渡し、dirtyを実際の作業状態として記録した。時刻・処理時間は再現性の比較から除外する。ローカル検証環境とCIの違いは[仕様](../river-crossing.md)を参照。

## 継続する評価

実機タッチ操作、人間の攻略・編成別の難度、多数の独立した生成seed、撤退目標に対するCPUの部隊保護、24・外洋の施設配置と先後差は継続課題。橋の破壊・長い橋・内陸河川の生成・有限物資・軍方針・キャンペーン追加は今回の対象外。
