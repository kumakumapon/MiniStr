# v1.5.16 ネイティブ確認

固定CPU/経路候補は`403eaebe032b79ac27a039a5c77e1d4ae1c4047f`。その後の変更はテストと文書だけで、実装・比較条件は維持した。正式lock、Node24、npm11.9.0、GitHub-hosted Ubuntuを使用した有限の確認であり、物理端末の測定ではない。

[最終QA run](https://github.com/kumakumapon/MiniStr/actions/runs/43540079834)はsuccess。単体1,833件/191ファイル、coverage=74.64/73.83/79.97/78.09%、配布UI67件/10ファイル、型・lint・整形・build・CI条件を確認した。[Playwright job](https://github.com/kumakumapon/MiniStr/actions/runs/43540079834/job/132278335643)は75件成功。Chromium/Firefox/WebKitで新規保存のpathVersion=1と、旧保存の読込・CPU v3への明示切替・prefix/state/元の保存枠保持・経路版を変えないことを検証した。初回の並行QAは追加テストのprefer-const指摘1件で失敗し、constへ修正して再確認した。16比較jobの結果とは区別する。既存timeout/retry・coverage・CI/Pagesの条件や権限は変更していない。

| 状態 | PC・日本語 | 390px・英語 |
| --- | --- | --- |
| 旧保存の経路説明・CPU切替 | [画像](legacy-ja-1280.jpg) | [画像](legacy-en-390.jpg) |
| 新規対局 | [画像](ja-1280.jpg) | [画像](en-390.jpg) |

4枚を目視し、盤面との重なり・横方向の欠落がないことを確認した。旧経路を継続する説明とCPU切り替えの説明を別々に表示する。新規則のために旧履歴を再計算することはない。

[CPU計測job](https://github.com/kumakumapon/MiniStr/actions/runs/43539689008/job/132277074215)は3ブラウザとも成功。[生データ](native-cpu.json)は合計32/64部隊、初期域/前線密集、normal/hardの8条件×各20標本。5回のwarmup後、毎回新しいDTOを渡して交互測定し、複製時間は除外した。4軍CPUのp95範囲はChromium 13.5〜29.4ms、Firefox 22〜40ms、WebKit 16〜25ms。帰還距離の探索は追加のCPU計算を行う。異なるVMの旧版との差で速度改善を主張せず、2軍対照も同等な対局や勝率の証拠とはしない。

回転した既知対局は、同じ初期seedと正規化した全局面を各命令後に照合し、6,537命令・89ラウンドの決着まで一致した。全36回転組と軍別/開始位置別の結果、旧14未決着の診断は[comparison.json](comparison.json)を参照。全ケースの打切り・新規未決着も保存し、一般的な公平性合格や全対局の決着は保証しない。実機のタッチ/支援技術と2/4時間の観戦/再生/画面往復は別の残件として残す。
