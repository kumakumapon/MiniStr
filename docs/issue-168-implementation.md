# #168 実装・検証記録

対象: `main` の `cb24dbbf15bc966b0838c99c2047a2a0bc6a78a9`。実装はドラフトPR #169を作成してから開始した。Issue #168の24項目を、コードで反映した範囲と残る検証・運用作業に分けて記録する。

公開Release本文は利用者が更新するため、このPRでは変更しない。CI/Pagesゲート、fork権限、private-link検査、保存形式の後方互換性を維持する。

## 項目別の結果

記号: **✓** 実装しローカル検査済み、**◐** 一部実装またはCI/外部評価待ち、**—** 今回は変更せず既存作業・別評価へ委ねる。

| # | 結果 | 実施内容・残件 |
| --- | --- | --- |
| 01 | ◐ | render世代に加えて利用者のfocus変更世代を確認する復元ガードを追加し、回帰テストを追加。Chromium/Firefox/WebKitとPagesゲートはPR CIで確認する。 |
| 02 | ✓ | バックアップの候補検証をdry-runで行い、失敗時は実行中カタログの正確なsnapshotを復元する。候補不正・既存カタログ破損の回帰を追加。 |
| 03 | ✓ | 展開前にカスタムシナリオ総セル数・部隊数を制限し、失敗時に既存カタログを保つ。 |
| 04 | ✓ | 対話開始・再開・replayに盤面/部隊/履歴予算を適用し、古い大規模セーブのparse/exportを維持する。 |
| 05 | ✓ | 同一内容の保存をno-op化し、旧形式セーブが参照しない履歴だけを整理。300回保存・履歴上限・旧形式参照を検査。 |
| 06 | ✓ | 撃破得点と複数勝利条件を考慮し、静的に断定できない条件は警告へ分離。 |
| 07 | ✓ | endTurnで即時勝利が成立するCPUターンは追加行動より終了を優先。hold勝利fixtureを追加。 |
| 08 | ◐ | editorのundo/redo状態、入力履歴のグループ化、書出し通知、縮小時hold目標・不正サイズを改善。IME/実ブラウザの回帰はCI待ち。 |
| 09 | ✓ | replay/backupの非同期読込をrequest IDと画面revisionで保護し、古い成功・失敗を無効化。 |
| 10 | ◐ | バックアップ復元時の`document.lang`を同期。学習/編集/保存エラーを含む全UI翻訳は継続課題。 |
| 11 | ◐ | 主要文字を相対単位化し、実際のcomputed font size・modal Tab循環をE2Eに追加。実機タッチ、読み上げ、コントラスト評価は未実施。 |
| 12 | ◐ | dense 32×32盤面の性能予算テストを追加し、editor tile検索をMap参照に変更。実ブラウザ計測と長時間処理の取消/分割はCI・別作業で確認する。 |
| 13 | ◐ | async request、screen revision、focus restoreを小さなUIモジュールへ分離。`main.ts`全体の状態遷移整理は未完了。 |
| 14 | ◐ | malformed input/状態境界の単体・配布UIケースを追加。3ブラウザE2EはCI待ち。 |
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
- Vitestは実行したテストの成功表示後にrunnerが終了せず、終了コード0を確認できなかったため、全体成功とは数えない。
- Playwrightブラウザのダウンロードは配布元から0 byteの不完全archiveが返り、Chromium/Firefox/WebKitをこの環境に導入できなかった。実E2EはPR CIで確認する。
- 実機アクセシビリティ、初心者評価、追加balance matrix、画像の完全decode/実転送計測は未実施。

## 変更の境界

バックアップpreviewは読込内容を確認してから復元するためのもので、Storage全体に対する複数タブtransactionを保証しない。旧形式セーブと自己完結型のreplayは上限外でも保持・exportできるが、新しい対話対局には使わない。依存更新、公開Release、未採用のゲームルール変更はこのPRに含めない。
