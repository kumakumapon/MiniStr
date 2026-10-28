# 依存・CI整備の確認記録

対象: PR #247。基準はv1.1.0 / `5094dfdea79a559a510e0a09290a8bc6b26498a4`。ゲーム規則・UI・保存形式・アプリ版番号は変更しません。

## 依存の選択

| 依存 | v1.1.0の解決版 | 今回の解決版 |
| --- | --- | --- |
| Vite | 6.4.5 | 8.3.5 |
| vite-node | 3.2.4 | 6.0.0 |
| ESLint | 10.8.0 | 10.13.0 |
| TypeScript | 5.9.3 | 6.0.3 |
| typescript-eslint | 8.66.0 | 8.72.1 |
| Node型 | 26.1.1 | 24.19.2 |
| Playwright | 1.62.1 | 1.64.1 |
| Vitest本体／coverage | 5.0.5 | 5.0.5（維持） |

10月28日にActionsで取得した最新版typescript-eslint 8.72.1もTypeScriptのpeer範囲は`>=4.8.4 <6.1.0`です。#162のTypeScript 7は採用せず、6.0系へ更新します。#202のNode型26系も採用せず、対応ランタイムの24系へ揃えます。この2件をそのまま実装済みとは扱いません。#201・#203・#204の候補と組み合わせて検証します。

Actionsは#157・#158・#159・#199・#200の候補SHAを使用し、checkout 7.0.1、setup-node 7.1.0、upload-artifact 7.0.2、upload-pages-artifact 5.0.0、deploy-pages 5.0.1へ更新します。SHA固定を維持します。

## lockfileの生成

ローカルのnpm通信制限を維持し、read-onlyの[依存解決run](https://github.com/kumakumapon/MiniStr/actions/runs/40692522259)のnpm 11.9.0で生成しました。生成した全JSONをログから取得し、manifestとlockfileのroot依存が一致することを検査しています。正式CIでは一時的な生成workflowを削除し、コミット済みlockfileへnpm ciを実行します。強制peer回避や手編集によるバージョンの置換は行いません。

## CIと公開条件

詳しくは[運用仕様](../ci-maintenance.md)を参照。mainのpushとPagesで二重に行っていた全検証を、CIの一つの経路へまとめます。手動Pagesも同じCIを呼び出します。feature手動・PR・fork PRでは公開しません。全ゲートとNode 22.13互換検証成功後に、同じrunのdistを公開します。現在のmainと異なるSHAは公開せず、GitHub APIの失敗でも公開へ進みません。

検証ジョブはread-only、公開ジョブだけにPages/OIDC権限。workflow/refごとの検証と公開の直列化を分けます。過去の品質ゲート・coverage閾値・対象・ブラウザケースは維持します。旧ミラー回帰のPages直接実行ケースは、共有CIの呼び出しを確認するケースへ更新しました。

新たにscriptsのmjsも整形対象とし、既存generate-music.mjsを整形しました。整形前後のAcorn ASTを位置・文字列表現情報を除いて比較し一致。生成音源や素材は変更していません。

## 検証

ローカルはNode 24.19.0、既設の旧依存（Vitest 3.2.7等）。依存不要のCI公開条件8件、監査判定19件・Ubuntuミラー5件、lint・テスト型を確認しました。正式な新依存での全検証はGitHub Actionsで判定します。

最終のクリーン導入・最新監査・カバレッジ・配布UI・3ブラウザ・Node 22.13互換性・CodeQLの結果と対象SHAはPR本文に記録します。現時点で新しい監査0件や全CI成功を確定したという記述ではありません。mainへのマージ後の自動公開、main手動公開、実際のforkからの実行は未実施です。
