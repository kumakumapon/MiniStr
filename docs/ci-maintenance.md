# 依存・CI・Pagesの運用

## 依存の対応範囲

- Node 24 / npm 11.9.0を正式CIに使用。Node 22.13.0でもnpm ci、依存整合性、型、全単体、ビルドを検証します。enginesは従来の22.13以降の22系または24系を維持します。
- Vite 8とvite-node 6を組み合わせ、補助スクリプトも同じViteを使用します。Vitest本体とcoverageは5.0.5の組み合わせを維持します。
- TypeScript 6.0.3とtypescript-eslint 8.72.1を使用します。2026-10-28に取得した最新版のtypescript-eslintもpeer条件は`>=4.8.4 <6.1.0`です。TypeScript 7の#162は採用せず、`--force`／`--legacy-peer-deps`で回避しません。Dependabotの6.1以降の制限はtypescript-eslint更新時に再評価し、対応範囲が変わったら解除します（#168）。
- Node型は実行環境に合わせた24系。#202の26系への更新は採用しません。DependabotのNode型major更新を抑制し、ランタイム更新時に合わせて見直します。
- Vitest、TypeScript関連、Vite関連はそれぞれDependabotのグループで更新します。全依存を一括でmajor更新する運用にはしません。

## 検証経路

| 起動 | 検証 | Pages |
| --- | --- | --- |
| mainへのpush | CIの全ゲート、Node 22.13互換性 | 同じrunで検証したdistを公開 |
| 通常・fork PR | 同じ検証。contents:read、Secret非利用 | upload・deployとも実行しない |
| Pages手動・main | 同じCIを再利用し、全検証を実行 | 現在のmainと一致する場合だけ公開 |
| Pages手動・feature | 同じCIを再利用し、全検証を実行 | upload・deployとも実行しない |

Pagesの独立したpush検証は廃止します。`.github/workflows/ci.yml`が検証と公開を定義し、`pages.yml`は手動起動用の呼び出しだけを持ちます。検証の省略や別runのartifact再利用は行いません。コミットと追跡ファイルのprivate-link検査、既存coverage対象・閾値、UIと3ブラウザのケースを維持します。

`terrain-stability`は地形画像比較の負荷変動を確認する追加の並列ジョブです。WebKitの5テーマ×2幅と不一致検出を3回ずつ（計33件）、2worker・retryなし・各30秒のまま実行します。通常の全ブラウザ検証も維持し、公開はcommit-hygiene・test-and-build・runtime-compatibility・terrain-stabilityの4ジョブ成功後に限ります。権限は検証と同じcontents:readで、追加のSecretや公開権限は持ちません。

検証のconcurrencyは各ジョブでworkflow名・ref・検証種別に分離します。workflow全体や手動呼び出し側にはconcurrencyを設定しません。同じrefの新しい検証は古い検証だけを取り消し、既に開始した公開を巻き込みません。公開ジョブは`pages-production`で直列化し、他の公開を取り消しません。直前にGitHub APIからmainのSHAを取得し、古いSHAは公開をスキップ、取得失敗や不正な応答は失敗とします。公開権限は公開ジョブだけに付与します。手動呼び出し側の権限は再利用先に許可する上限で、各検証ジョブはcontents:readに制限されます。

## 監査と失敗時の記録

`npm ls --all`でpeerを含めた依存整合性を確認し、`scripts/dependency-audit.ts`で全依存と`--omit=dev`の両監査を取得します。high／criticalは失敗、取得不能・不正な報告も失敗です。moderate以下も全件を証跡へ残し、レビューで対応要否を判断します。未修正の指摘を例外として自動承認することはありません。

監査JSON、ブラウザtrace、画面画像を14日間artifactに保存します。長期に必要な公開判断は`docs/reviews/`へ記録します。ジョブの時間上限は停止箇所の把握のためであり、テスト削除・閾値緩和の理由にはしません。

`npm run test:ci`は依存不要のNode標準テストで、公開対象・古いSHA・API失敗・workflow呼び出し・権限・concurrency・SHA固定・品質ゲートを検査します。Ubuntuミラー設定と監査判定にも回帰テストがあります。実際のmain push／main手動の公開確認は、PRマージ後に別途行います。fork実行の実地確認やGitHub Pages自体の障害を、ローカル回帰の成功で確認済みとは扱いません。
