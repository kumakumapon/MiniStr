# 依存・配信の確認（2026-10-02）

## 再現環境

Node 22 LTSをCIと.nvmrcの推奨にし、enginesで22/24、npm 10–12を許容。packageManagerはnpm 11.9.0。ローカル検証はNode 24.19.0 / npm 11.9.0、CIはNode 22。clean checkoutでは `npm ci` を用いる。GitHub Actionsを検証済みコミットSHAに固定し、npmとActionsの週次Dependabotを追加した。

## 依存監査

`npm audit fix --ignore-scripts` の互換更新でhigh 2件を解消。2026-10-02の `npm audit --omit=dev` は0件。開発依存の全監査にはmoderate 3件（Vitest / mocker / coverageの同一原因の依存連鎖）が残る。

例外: [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)。Vitest 3系には修正版がなく、修正版は4.1.11。本プロジェクトはnode/jsdomの `vitest run` を使い、standalone mockerPlugin / interceptorPluginや公開されたHMRサーバーを提供しない。Pagesは静的distのみでVitestを配信しない。この利用条件を根拠に期限付きで残し、**2026-10-16までにVitest 4移行とカバレッジ差を再評価**する。これは脆弱性の修正済み宣言ではない。Watch/HMRを公開する構成へ変える場合は例外を取り消す。

lockfileのライセンス欄を集計: MIT 227、Apache-2.0 19、ISC 15、BSD-2-Clause 8、BSD-3-Clause 7、BlueOak-1.0.0 6、MIT-0 2、CC0-1.0 1、未記載0。外部実行時依存の追加なし。既存LICENSE/帰属表記を維持。READMEの画像出所（GPT Image 2生成）も保持する。

## 配信とオフライン

ポートレートをlossless WebPへ変更: 青455,819→306,270 bytes、赤394,724→261,490 bytes。合計850,543→567,760 bytes（33.25%減）。可視RGBとalphaが一致し、完全透明画素の不可視RGBだけ正規化された。表示寸法・lazy/async decodeを指定し、原PNGは出所保護のため残す。ゲームからはWebPを参照する。

背景2枚はv0.1.0に含まれる原ファイルがPNGとして完全に復号できなかった。battlefield-bg.pngはタグからの再取得とSHA-256も一致した。元画像を創作で置き換えず、背景圧縮は修復可能な原素材の確認まで後回し。既存CSSの背景色フォールバックを維持する。

JSは新機能によりgzip約51.19→65.09KB、CSSはgzip約11.09KB。画像削減とJS増分を別に記録する。これはブラウザーの実転送/キャッシュ性能の測定ではない。

Service Worker/PWAは今回採用しない。初回オフライン起動は保証しない。既に起動済みのタブはネットワークAPI不要で対局を続行できるが、オフラインで再読込できるかはHTTPキャッシュに依存する。新版は通常の再読込で取得し、独自の旧assetキャッシュを導入しない。セーブを更新処理で削除しない。

画面にバージョン/SHAを表示。利用者が選ぶ診断出力はversion/SHA、保存可否・バイト数、表示言語、viewport寸法だけのローカルJSON。セーブ本体・URL・端末UA・プレイ履歴・個人名を含めず、外部送信もしない。
