# 依存・配信の確認（2026-10-02）

## 再現環境

Node 22 LTSをCIと.nvmrcの推奨にし、enginesで22/24、npm 10–12を許容。packageManagerはnpm 11.9.0。ローカル検証はNode 24.19.0 / npm 11.9.0、CIはNode 22。clean checkoutでは `npm ci` を用いる。GitHub Actionsを検証済みコミットSHAに固定し、npmとActionsの週次Dependabotを追加した。

## 依存監査

以下は2026-10-02時点の記録。2026-10-16の再評価と更新構成の検証結果は[再評価欄](#2026-10-16-再評価pr-163)に記載する。

`npm audit fix --ignore-scripts` の互換更新でhigh 2件を解消。2026-10-02の `npm audit --omit=dev` は0件。開発依存の全監査にはmoderate 3件（Vitest / mocker / coverageの同一原因の依存連鎖）が残る。

例外: [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)。Vitest 3系には修正版がなく、修正版は4.1.11。本プロジェクトはnode/jsdomの `vitest run` を使い、standalone mockerPlugin / interceptorPluginや公開されたHMRサーバーを提供しない。Pagesは静的distのみでVitestを配信しない。この利用条件を根拠に期限付きで残し、**2026-10-16までにVitest 4移行とカバレッジ差を再評価**する。これは脆弱性の修正済み宣言ではない。Watch/HMRを公開する構成へ変える場合は例外を取り消す。

lockfileのライセンス欄を集計: MIT 227、Apache-2.0 19、ISC 15、BSD-2-Clause 8、BSD-3-Clause 7、BlueOak-1.0.0 6、MIT-0 2、CC0-1.0 1、未記載0。外部実行時依存の追加なし。既存LICENSE/帰属表記を維持。READMEの画像出所（GPT Image 2生成）も保持する。

### 2026-10-16 再評価（PR #163）

対象はmain `f4c003144154bcb8c763cfe9803da98e5ed96ea5` と既存の [PR #163](https://github.com/kumakumapon/MiniStr/pull/163)。coverageだけを5.0.2へ上げた既存PRは、Vitest本体3.2.7とのpeer不整合で `npm ci` が失敗していた。本体とcoverageを同じ5.0.2へ固定し、削除された `environmentMatchGlobs` をNode/jsdomの `projects` へ移行した。テスト用TypeScript設定には、Vitestからの暗黙の参照に依存せず `node` 型を明記した。Vitest 5の要件に合わせてViteの最低版を6.4.3へ、既存jsdomの要件も含めてNode 22の最低版を22.13.0へ明記する。DependabotではVitestと `@vitest/*` を同じ更新グループへまとめ、別々の更新による不整合を防ぐ。

カバレッジ対象の `src/main.ts` と既存の除外を維持する。Vitest 5では `vitest list --no-static-parse --json` で実際にテストを収集し、全64ファイルの包含、Node/jsdomの割当、重複がないことを検査する。既定の静的解析では、共通fixtureから登録するCPUテストを列挙できないためであり、実行するテストを除外する変更ではない。

比較用に隔離した現行mainで `npm run test:coverage -- --maxWorkers=2` を実行し、Vitest/coverage 3.2.7で64ファイル・651件が成功した（148.59秒）。新版でも両構成で651件すべて成功したが、旧閾値によるゲートは失敗した。[移行途中の計測](https://github.com/kumakumapon/MiniStr/actions/runs/38904191088)と旧版の結果は次のとおり。旧版はローカルNode 24.19.0、新版はActionsのNode 22.23.3であり、速度比較の測定ではない。

| 構成 | statements | branches | functions | lines |
| --- | ---: | ---: | ---: | ---: |
| Vitest/coverage 3.2.7、Vite 6.4.3 | 72.46% | 91.95% | 95.42% | 72.46% |
| Vitest/coverage 5.0.2、Vite 6.4.3 | 63.21% | 61.51% | 69.63% | 66.34% |
| Vitest/coverage 5.0.2、Vite 8.3.4、ESLint 10.12.0 | 63.08% | 61.51% | 69.63% | 66.20% |

測定対象は両版とも65実装ファイル。旧集計では未実行の `main.ts` の関数・分岐を各1件と数えていたが、新版は316関数・1,674分岐を数える。測定対象と全651件を維持したまま、新しい集計に合わせてglobal閾値をstatements 62、branches 60、functions 68、lines 65へ再設定した。AI・ゲーム規則・UIモジュールの退行も独立して検出できるよう、次のディレクトリ別ゲートを追加した。各ディレクトリはglobal集計にも含む。閾値の自動更新やテスト削除、skipは追加しない。

| 範囲 | statements | branches | functions | lines |
| --- | ---: | ---: | ---: | ---: |
| `src/ai/**` | 98 | 96 | 98 | 99 |
| `src/game/**` | 91 | 89 | 95 | 95 |
| `src/ui/**` | 79 | 72 | 83 | 81 |

2026-10-16時点で [Vite更新 #161のCI](https://github.com/kumakumapon/MiniStr/actions/runs/38716499762) と [ESLint更新 #165のCI](https://github.com/kumakumapon/MiniStr/actions/runs/38716475476) は成功している。以前の失敗を現在の阻害要因と扱わない。今回、Vitest移行との組合せも以下のとおり検証した。#161/#165のマージは実施していない。

ローカルのnpm通信制限は変更せず、一時ブランチのGitHub Actionsへ依存取得・監査・検証を移した。`contents: read` の権限でlockfileを生成し、続けて `npm ci` と `npm ls --all` を実行。生成したlockfileと監査JSONを回収した。書込権限やSecret、既存CI/Pagesの変更は使っていない。検証環境はNode 22.23.3 / npm 11.9.0。

初回の最新監査で、新たに `source-map-js` 1.2.1のhigh [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) を検出した。`npm update source-map-js --package-lock-only --ignore-scripts --no-audit` で既存依存の互換範囲内の1.2.2へ更新し、手作業でlockfileを書き換えず再生成した。Vitest 5.0.2との組合せで、全依存・本番依存とも `npm audit --json` の指摘は0件。旧Vitest/mockerの3系はこのlockfileに残っていない。公開ゲーム利用者への影響を確認した記録ではない。

更新後のlockfileのライセンス欄を再集計（ルートを除く227件、optional依存を含む）: MIT 186、Apache-2.0 18、ISC 7、BSD-2-Clause 8、BSD-3-Clause 3、BlueOak-1.0.0 2、MIT-0 2、CC0-1.0 1、未記載0。実行時依存の追加はない。

[最終検証run 38904800411](https://github.com/kumakumapon/MiniStr/actions/runs/38904800411)（検証コミット `f8c8b07301e1622b8958f2fa511f3155ceda7e0d`）の2ジョブはともに成功した。既存CIとPagesのworkflowには変更を加えていない。

| 検証 | Vitest更新単独（Vite 6.4.3 / ESLint 10.8.0） | #161/#165との組合せ（Vite 8.3.4 / ESLint 10.12.0） |
| --- | --- | --- |
| クリーンインストール・依存関係整合 | `npm ci` / `npm ls --all` 成功 | 同左 |
| 最新監査 | 全依存0件、本番依存0件 | 同左 |
| リンク・lint・整形・テスト型チェック | 成功 | 成功 |
| テスト列挙と環境 | 64ファイル・651件、Node 497 / jsdom 154、重複なし | 同左 |
| 単体・カバレッジ | 651件成功、globalと3ディレクトリのゲート成功 | 同左 |
| ビルド・配布UI | ビルド成功、UI 7件成功 | 同左 |
| E2E | Chromium / Firefox / WebKitで68件成功 | 同左 |

PR #163のlockfileは単独構成のActions生成物とSHA-256が一致する（`6b8ea2f270387140b831a5544d54b7181d758a13ddb0f721ab302d345fa7aa03`）。上記runには監査JSON、生成lockfile、coverage summary、ブラウザー結果のartifactも保存した。

更新構成ではGHSA-82fw-gwwq-j7x9の例外は不要。mainへの例外解除の適用には#163のマージが必要であり、期限だけを延長しない。ゲーム規則・保存形式・公開条件の変更や、本番へのデプロイは今回実施していない。

## 配信とオフライン

ポートレートをlossless WebPへ変更: 青455,819→306,270 bytes、赤394,724→261,490 bytes。合計850,543→567,760 bytes（33.25%減）。可視RGBとalphaが一致し、完全透明画素の不可視RGBだけ正規化された。表示寸法・lazy/async decodeを指定し、原PNGは出所保護のため残す。ゲームからはWebPを参照する。

背景2枚はv0.1.0に含まれる原ファイルがPNGとして完全に復号できなかった。battlefield-bg.pngはタグからの再取得とSHA-256も一致した。元画像を創作で置き換えず、背景圧縮は修復可能な原素材の確認まで後回し。既存CSSの背景色フォールバックを維持する。

JSは新機能によりgzip約51.19→65.09KB、CSSはgzip約11.09KB。画像削減とJS増分を別に記録する。これはブラウザーの実転送/キャッシュ性能の測定ではない。

Service Worker/PWAは今回採用しない。初回オフライン起動は保証しない。既に起動済みのタブはネットワークAPI不要で対局を続行できるが、オフラインで再読込できるかはHTTPキャッシュに依存する。新版は通常の再読込で取得し、独自の旧assetキャッシュを導入しない。セーブを更新処理で削除しない。

画面にバージョン/SHAを表示。利用者が選ぶ診断出力はversion/SHA、保存可否・バイト数、表示言語、viewport寸法だけのローカルJSON。セーブ本体・URL・端末UA・プレイ履歴・個人名を含めず、外部送信もしない。

## 2026-10-31 v1.2.2準備中の再評価（PR #254）

CI 41172269209（head `2d633af0f0508e305740bba0a81c31aa484d4574`）で、全依存moderate12件／high0／critical0、本番依存0件を有効な2報告で取得。10月30日の0件という記録は当時の結果として保持する。

新規指摘は開発依存minimatchの [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)（globparts増幅によるDoS、報告範囲<11.0.1）と、ESLint／typescript-eslint等への推移的連鎖。12件を12個の独立した根本脆弱性とは数えない。公開ゲームに本番依存として配信される経路はなく、本番監査は0件。開発・CIのglob処理は対象リポジトリのファイルと設定に対して実行されるため、任意のglob入力を公開ゲームから受信する構成ではない。fork PRはread-only・Secretsなしの既存CIを維持し、検証ジョブの時間上限も維持する。残る影響は開発／CIの資源消費・可用性であり、影響なしとは扱わない。

既存方針ではmoderateは全件を記録しレビュー、high／critical・監査取得失敗は停止する。今回のリリース準備では互換性を確認できない旧majorへのnpm fixAvailable（ESLint4／typescript-eslint8.14等）を適用しない。互換性のある修正版・上流依存更新を継続確認し、**2026-11-07 UTCまでに再評価**する。#168で追跡し、#253のjsdom更新とは別の依存問題として扱う。ゲートの無効化・重大度変更・自動例外承認は追加しない。

監査結果の非空配列を含む証跡JSONで整形検査が失敗したため、既存Prettier設定で証跡を書き出す処理と同値性の回帰を追加。報告値・配列・取得時刻・両scopeを保持し、監査と整形の判定基準を緩和しない。最終対象SHAの監査結果はPR #254へ記録する。
