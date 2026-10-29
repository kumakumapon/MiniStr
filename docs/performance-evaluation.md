# 性能・先後バランスの再評価手順

## 性能

```sh
npm run profile -- --samples 30 > performance.json
npx playwright test tests/e2e/performance.spec.ts --project=chromium --workers=1
```

Node計測は5回warm-up後の30標本からnearest-rankのp50／p95／最大値を記録します。通常CPU（初期状態生成を含む）、32×32・128部隊のCPU／手番終了、12保存×800指令の一覧、2,400指令のリプレイから800指令地点までの再生・seek・霧イベント表示を対象とします。再生処理の失敗、欠けた保存スロットは計測失敗として終了します。

比較時は同じ端末・Node・依存・fixtureで、別プロセスの変更前／変更後を交互に3回以上実行します。別のCPU対局・テストと同時に性能比較しないでください。各実行のp50の中央値と全raw値を保存し、有利な実行だけを選びません。環境とソースハッシュも照合します。小さい差やGCの影響を一律に改善と判定しません。heap差分にはGCが含まれ、保持メモリやリークの証明には使えません。

ブラウザ計測は16／32マス、1280／390pxでユニット選択とズームを確認します。実ポインタ操作で導線を検証してから、native click handlerから2つのanimation frameまでを測り、Playwrightの通信時間を除きます。2回のwarm-upと5標本、ブラウザ版・配布bundle名・DOM数・画面画像をtest-resultsに保存します。フレーム待ちを含む診断値であり、5標本や390px幅を実機のp95保証として扱いません。CIには端末依存の速度閾値を設定しません。

## CPU・先後の対比較

```sh
npm run balance:paired -- --sizes 16,20,24 --seas none,coast,ocean --seeds eval-a,eval-b --matchups easy:easy,normal:normal,hard:hard --variants seeded --rounds 60 --seconds 3600 --max-games 128 --output balance.jsonl
```

初戦のCPU設定A（赤・先攻）とB（青・後攻）を、復路では交換し、配置も180度回転します。赤が先攻であることは両局とも同じです。A／Bの難易度・方針と地理的な側を対応させ、先後に加えて配置方向の影響を調べます。先後補正は実ゲームと同じ指定値（既定2,000G）を両局に適用します。

- `--matchups hard:normal`で難易度の交換、`--policies offensive:defensive,balanced:offensive`で方針の交換を指定できます。
- `--variants seeded,frontline`で通常／前線、`--damage-seeds 0,7919`で地形seedと独立の戦闘乱数を比較できます。旧世代generatorの比較は既存generatedBalanceのvariantを使用します。
- `--max-games`は復路も含みます。時間・ラウンド・120指令／手番の上限、合法指令の境界を保ちます。時間切れ・不正指令は成功扱いせず、完了済みの局と明示的な失敗レコードを残します。
- 各局の指令ハッシュ・ピーク部隊数・CPU判断時間・決着理由・開幕拠点距離を保存します。最終行のcompleteを確認してください。途中ファイルを完了評価に使いません。
- 未決着は勝利にも引き分けにも数えません。往復は相関のある標本です。両局とも先攻勝ち／両局とも後攻勝ち／先後で分かれた組を分けて読み、全体勝率だけで公平性を断定しません。
- 機械評価では人間の遊びやすさは判定できません。未使用seed・生成条件と人間の対局で追加確認し、小標本から全マップの補正やCPU重みを一括変更しません。

今回の計測値と判断は[2026-10-28の記録](reviews/2026-10-28-performance-balance.md)を参照。
