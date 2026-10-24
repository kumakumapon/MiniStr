# #230 日替わりチャレンジ 実装計画

## 目的
UTC日付から固定条件の生成戦域を決定的に導出し、タイトルの「今日の戦域」から1操作で開始できる。結果（最短ターン・損失）を日付別にローカル保存する。サーバー・ランキングは対象外。

## 確認済みの前提
- 生成マップは戦績の対象外（`operationRecords.ts` の `operationIds` は組み込み作戦のみ。`docs/recon-control-records.md`）。
- 生成ボタンはカスタム作戦（上限32件・1MB）として保存する。
- 未知の `ministr.*` キーはバックアップ復元で拒否される（`backup.ts`）。

## 設計判断
1. **保存先**: 既存 `ministr.operations.records` は変更せず、別キー `ministr.daily.records`（独立 schema 1）を新設する。コンテナ schema 4・ruleVersion は変更しない。
2. **日付→条件**: `dailyConditions(date, version='d1')` は純関数。FNV-1a で `daily-d1:<date>` をハッシュし、サイズ・海域・戦域設定を選び、seed は `D<YYYYMMDD>`。日付は `toISOString()` のUTCのみ使い、`now` は注入可能。版ごとに導出を凍結し、将来は `d2` を追加する。
3. **識別子**: `D1-YYYYMMDD-v{2|3}`。結果画面でコピーできる。
4. **固定条件**: 人間の赤軍対CPU、難易度は普通、有限補給（現行ルール）。標準編成のまま開始した対局だけを記録対象とし、編成を変えた場合は記録しない旨を表示する。
5. **結果判定**: 生成作戦は `operationVictory` を通らないため、コマンド列再生による ターン・損失の算出を共用関数に切り出して日付用に使う。既存の検証は弱めない。
6. **カスタム枠**: 日替わりのシナリオは既存の生成と同じく `saveCustomScenario` で保存する（決定的IDのため同日再開始は上書き）。自動削除はしない。満杯なら既存の通知で案内する。
7. **記録**: `{ date, generation, ruleVersion, bestTurns, bestLosses, updatedAt }`、最新60日、件数・バイト・日付形式・重複・値域を検証。ローカル編集可能で認証付きランキングではない旨を表示する。
8. **日付の扱い**: 開始時点で日付を確定。カードにUTC基準（日本時間9時切替）を明示する。
9. **互換**: 新キーを含むバックアップは旧アプリで拒否される。docsに明記する。

## 変更範囲
- 新規: `src/game/dailyChallenge.ts`（+test）、`src/ui/dailyChallenge.ts`（+test）、`tests/e2e/daily-challenge.spec.ts`、`docs/daily-challenge.md`
- 変更: `src/game/backup.ts`、`src/main.ts`（状態・開始・結果記録・復元後再読込・削除）、`src/ui/overlays.ts`、`src/ui/english.ts`、`docs/persistence-schema.md`、README
- 変更しない: 生成ロジック（`mapGenerator.ts`）、CI、Pages、`check-private-links.sh`

## テスト
- 固定日付→固定条件の表、UTC境界、全日付スイープで生成成功と `inspectGeneratedMap` 通過、生成物のスナップショット（過去日付の再現性）
- 記録の不正値・旧データ・上限・保持日数・保存失敗時の保持、バックアップ往復と不正値拒否
- UI単体、英語表示、e2e（1操作開始、キーボード、スマホ幅、記録の表示/削除、時計固定）
- `balance:compare` で候補条件を比較し、偏りの大きい組を除外して `docs/reviews/` に記録

## リスク
- 生成ロジック変更で過去日付が変わる → スナップショットテストで防ぐ。
- タイトルの要素追加による既存e2e・スクリーンショットへの影響 → 実行して確認する。
