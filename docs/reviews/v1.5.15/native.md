# v1.5.15 ネイティブブラウザ確認

CPU候補は `74eaf26c86dc9642cf031a3f4be757279654f068` に固定。以後のアプリ実装は同じで、旧CPU比較スクリプトの版指定、追加試験の準備手順と文書を修正した。Node24・npm11.9.0・正式lockを使ったGitHub-hosted Ubuntuの測定であり、物理端末の結果ではない。

## 保存と切り替え

[最終確認 run 43521413359](https://github.com/kumakumapon/MiniStr/actions/runs/43521413359) の [playtest job](https://github.com/kumakumapon/MiniStr/actions/runs/43521413359/job/132216325652) で75件成功。Chromium・Firefox・WebKitで4軍画面/Worker取消・バックアップと旧保存のCPU切り替えを確認した。確認sourceは `5b4e83a8f55579d001d052619ee34442a0ff6f06`。

旧CPUで実行した2命令を含む保存を停止状態で読み込み、旧CPUのまま書き出せること、明示切り替えで2命令のprefix・現在state・元の保存枠を保持することを確認。切り替え後の3命令目がv1の移動先(11,6)からv2の(12,5)に変わり、CPU識別子v2で別枠へ保存されることも検証した。PC/390px・日本語/英語の画面を目視し、盤面との重なりや横方向の欠落がないことを確認した。

| 状態 | PC・日本語 | 390px・英語 |
| --- | --- | --- |
| 旧CPUの説明と切り替え操作 | [画面](legacy-ja-1280.jpg) | [画面](legacy-en-390.jpg) |
| 新規CPU v2対局 | [画面](ja-1280.jpg) | [画面](en-390.jpg) |

初回確認では新規E2E6件とDOM1件の準備が不適切だった。E2Eはアプリ起動後に保存枠を外から書き換えたため、既存の外部更新保護が正常に拒否した。起動前の初期データ投入へ修正した。DOMは保存枠投入後に画面を更新せず無効な読込ボタンを押していたため、既存試験と同様に再描画した。初回run全体はこのためfailureで、比較12job・CPU時間計測の成功とは区別する。製品の保存保護・既存timeout/retry・CI条件は変更していない。最終確認runはsuccessで、単体1,829件/188ファイル、配布UI67件/10ファイルも成功した。

## CPU時間

[固定候補の計測](https://github.com/kumakumapon/MiniStr/actions/runs/43519369406/job/132209457870) は3ブラウザとも成功。[生の値](native-cpu.json) に各条件20標本のp50/p95/maxを残す。条件は合計32/64部隊、初期域/前線密集、normal/hardの8通り。毎回新しいDTOを渡し、5回のwarmupと交互測定を行い、複製時間は除外した。

4軍CPUのp95範囲はChromium 9.2〜25.6ms、Firefox 13〜20ms、WebKit 8〜15ms。2軍の同総部隊対照も記録するが、アルゴリズム・敵数・盤面条件が異なる。勝率や同等な対局の証拠ではなく、別VMの旧版測定との差から速度改善も主張しない。

未決着・軍別勝利の新旧比較は [comparison.json](comparison.json)、停滞からの再開と経路差の診断は [diagnosis.json](diagnosis.json) を参照。2/4時間・実機のタッチ/支援技術は未実施で、従来の10分観測から一般化しない。
