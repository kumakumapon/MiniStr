# #168 実装・検証記録

対象: `main` の `cb24dbbf15bc966b0838c99c2047a2a0bc6a78a9`。実装はドラフトPR #169を作成してから開始した。Issue #168の24項目を、コードで反映した範囲と残る検証・運用作業に分けて記録する。

公開Release本文は利用者が更新するため、このPRでは変更しない。CI/Pagesゲート、fork権限、private-link検査、保存形式の後方互換性を維持する。

## 2026-10-16追記: 項目19の依存更新

既存 [PR #163](https://github.com/kumakumapon/MiniStr/pull/163) でVitest本体とcoverageを5.0.2へ揃え、Node/jsdomの `projects` へ設定を移行。対象mainは `f4c003144154bcb8c763cfe9803da98e5ed96ea5`。テスト設定へNode型を明記し、DependabotでもVitest関連を一緒に更新する。ローカルのnpm通信制限を変更せず、一時ブランチのActionsでlockfileを生成。新たに検出した `source-map-js` のhighも1.2.2への互換パッチで修正した。

[最終検証run 38904800411](https://github.com/kumakumapon/MiniStr/actions/runs/38904800411)でVitest更新単独とVite 8.3.4 / ESLint 10.12.0併用の両構成が成功。各構成でクリーンインストール、依存整合、全依存・本番依存とも監査0件、リンク/lint/整形/テスト型チェック、単体651件、カバレッジ、ビルド、配布UI7件、Chromium/Firefox/WebKit E2E 68件を確認した。新版の詳細なカバレッジ集計に合わせてglobal閾値を再設定し、65実装ファイルを維持してAI・ゲーム規則・UIの独立したゲートも追加した。更新構成では旧Vitest監査例外は不要だが、mainへの適用は#163のマージ後となる。他の依存PRや項目19全体を完了扱いにはしない。

#161と#165の最新CIは成功しており、過去の失敗で停止中とは扱わない。組合せを含む検証結果と監査例外の扱いは[依存・配信レビューの再評価欄](reviews/2026-10-02-dependency-delivery.md#2026-10-16-再評価pr-163)へ記録する。以下の項目別の表は#169当時の実施範囲を保持した記録である。

## 項目別の結果

記号: **✓** 実装しローカル検査済み、**◐** 一部実装またはCI/外部評価待ち、**—** 今回は変更せず既存作業・別評価へ委ねる。

| # | 結果 | 実施内容・残件 |
| --- | --- | --- |
| 01 | ◐ | render世代に加えて利用者のfocus変更世代を確認する復元ガードを追加し、回帰テストを追加。Chromium/Firefox/WebKitとcommit-hygieneはPR CIで確認する。Pages workflow自体はmainへのpush時のみなので、このPRでは未実行。 |
| 02 | ✓ | バックアップの候補検証をdry-runで行い、失敗時は実行中カタログの正確なsnapshotを復元する。候補不正・既存カタログ破損の回帰を追加。 |
| 03 | ✓ | 展開前にカスタムシナリオ総セル数・部隊数を制限し、失敗時に既存カタログを保つ。 |
| 04 | ✓ | 対話開始・再開・replayに盤面/部隊/履歴予算を適用し、古い大規模セーブのparse/exportを維持する。 |
| 05 | ✓ | 同一内容の保存をno-op化し、旧形式セーブが参照しない履歴だけを整理。300回保存・履歴上限・旧形式参照を検査。 |
| 06 | ✓ | 撃破得点と複数勝利条件を考慮し、静的に断定できない条件は警告へ分離。 |
| 07 | ✓ | endTurnで即時勝利が成立するCPUターンは追加行動より終了を優先。hold勝利fixtureを追加。 |
| 08 | ◐ | editorのundo/redo状態、入力履歴のグループ化、書出し通知、縮小時hold目標・不正サイズを改善。該当E2Eは成功。IME個別評価は未実施。 |
| 09 | ✓ | replay/backupの非同期読込をrequest IDと画面revisionで保護し、古い成功・失敗を無効化。 |
| 10 | ◐ | バックアップ復元時の`document.lang`を同期。学習/編集/保存エラーを含む全UI翻訳は継続課題。 |
| 11 | ◐ | 主要文字を相対単位化し、実際のcomputed font size・modal Tab循環をE2Eに追加。実機タッチ、読み上げ、コントラスト評価は未実施。 |
| 12 | ◐ | dense 32×32盤面E2Eは三つのbrowser projectで315.5〜512.0ms、5秒基準内。editor tile検索をMap参照に変更。長時間処理の取消/分割や広範な実機計測は未実施。 |
| 13 | ◐ | async request、screen revision、focus restoreを小さなUIモジュールへ分離。`main.ts`全体の状態遷移整理は未完了。 |
| 14 | ✓ | malformed input/状態境界fixtureと配布UIケースを追加。PR CIで3 browser projectを含む44件が成功。 |
| 15 | ◐ | 復元前に全候補を検証し、変更件数と削除対象を確認できるpreviewを追加。複数タブ間の復元競合は未実装。 |
| 16 | — | 今回は目的別・陣営別の拡張balance matrixを実行していない。前回の比較記録を新規計測として扱わず、fixtureと判定方法を別途整える。 |
| 17 | ◐ | 練習進捗をコマンド履歴ではなく占領結果・同一輸送船の搭乗/上陸結果で判定。初心者による実利用評価は未実施。 |
| 18 | ◐ | 境界値・失敗時状態・旧形式互換fixtureを追加。property-based generatorは導入していない。 |
| 19 | — | Dependabot #157〜#167が既に開いているため重複更新を作らない。特にcoverage更新はVitest本体との互換性を既存PRで確認する。監査例外も今回再評価していない。 |
| 20 | ✓ | Pages concurrencyをworkflow/ref単位に限定し、異なるref間の不要なcancelを防止。同一ref直列化と既存の完全なPages gateは維持。 |
| 21 | ◐ | 本記録を追加。既存の`docs/releases/v0.1.0.md`とタグ状態は確認対象とし、公開Releaseの編集・公開は実施しない。 |
| 22 | — | 実行環境の部分checkoutに元画像がなく、実転送/全画像decodeを検証できない。リポジトリ内の既存画像帰属情報や診断プライバシーを変更しない。 |
| 23 | ◐ | Prettier除外から`src/game/maps.test.ts`、`src/game/session.test.ts`、`src/ai/rules-strike.test.ts`を外し、書式検査を通した。残りの既存除外は段階的に扱う。 |
| 24 | ✓ | 既存の[拡張採否記録](reviews/2026-10-02-expansion-decisions.md)を参照し、新規ルールを採用済みと誤記しない。 |

## ローカル検証

- `npm run lint`: 成功。
- `npm run format:check`: 成功。
- `npm run build`: 成功。部分checkoutに背景画像2点がないためViteが解決時の警告を出すが、GitHub上のmainには存在する。
- `npm run typecheck:test`: 成功。
- `FocusRestoreGuard`の新旧render/focus revision条件をNode assertionで検査: 成功。
- `npx playwright test --list`: Chromium全体とFirefox/WebKit互換性suiteに44件を登録。
- ローカルVitest runnerは成功表示後も終了しなかったが、GitHub Actions run [#235](https://github.com/kumakumapon/MiniStr/actions/runs/37182798388)ではcoverage 52 files / 497 tests、配布UI 7 tests、Playwright 44 testsがすべて成功。
- ローカルのPlaywright browser取得は0 byte archiveで失敗。CI側のbrowser取得・実行は成功し、32×32 editor renderは315.5〜512.0ms。
- Pages workflowはmainへのpush時のみ起動し、このPRではPages upload/deploy jobを実行していない。PR CIのbuild・テストゲートは成功。
- 実機アクセシビリティ、初心者評価、追加balance matrix、画像の完全decode/実転送計測は未実施。

## 変更の境界

バックアップpreviewは読込内容を確認してから復元するためのもので、Storage全体に対する複数タブtransactionを保証しない。旧形式セーブと自己完結型のreplayは上限外でも保持・exportできるが、新しい対話対局には使わない。依存更新、公開Release、未採用のゲームルール変更はこのPRに含めない。
