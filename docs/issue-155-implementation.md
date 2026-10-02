# #155 実装・検証記録

PR: [#156](https://github.com/kumakumapon/MiniStr/pull/156)。基準: v0.1.0 / `b9cde2f9a67536c4ab2c8f30004eb0a982800e33`。
最初にこの追跡ファイルだけをコミットしてドラフトPRを作成し、その後に製品コードへ着手した。

採用した改善と、追加の評価・別設計が必要な提案を以下に対応付ける。「一部採用」は行全体の完了を意味しない。未実装の将来案や人による未実施評価を完了扱いでIssueを閉じない。

## 各項目の判断

| # | 判断 | 今回の実装 / 根拠 | 残る範囲 |
| --- | --- | --- | --- |
| 01 | 採用 | ダメージ最小/最大から生存・反撃範囲を計算。CPUの確殺判定も最小値使用。乱数結果を予測幅に含める回帰テスト | なし |
| 02 | 採用 | schema 4のシナリオsnapshot、旧定義の永続archive、canonical初期状態と履歴の再検証。上書き/削除/別環境/旧形式を試験 | 導入前に失われた原定義は復元不能。保存仕様に明記 |
| 03 | 採用 | 壊れた/欠落/孤立slotの可視化・削除。reserved ID拒否。payload/indexのロールバック | localStorage自体の真のtransactionは提供不可。失敗を隠さない |
| 04 | 採用 | 全JSON入口をbytes→反復深さ/ノード→形式→移行→再現検証へ。4000段の旧形式・巨大値を回帰化 | 計算予算外の旧データは明示拒否し原本を維持 |
| 05 | 採用 | getter/read不可時のメモリ保存、警告、設定write例外処理。配布JSで起動/対局/保存まで試験 | メモリ保存はタブ終了で失われる |
| 06 | 採用 | ロード全検証後にだけ対局/キャンペーン/タイマーを変更。配布JSで失敗前後の盤面一致 | なし |
| 07 | 採用 | 敵のfuel/ammoを公開上限へ正規化、敵資金/収入を非観測化。UI/AI/threatの対状態不変性を試験 | 相手の正確な残弾を使った反撃確定表示は行わない |
| 08 | 採用 | Pagesの同一checkout→リンク/lint/format/型/coverage/build/配布UI/3-browser E2E→artifact→deploy。main限定・最小権限 | 実際の本番deployはこのPRでは実行しない |
| 09 | 一部採用 | slot検証/結果summary/定義解析を変更単位でcache。視界走査を領域制限。12×150履歴を計測 | DOM全置換/位置indexはブラウザーprofile後。実機入力p95は未計測 |
| 10 | 採用 | タイトルに同じ保存一覧。名前付きのみでも続行可能。観戦停止/ホットシート受渡しを維持 | なし |
| 11 | 採用 | 削除/上書き/対局置換確認、全データbackupと検証後restore、別タブ検知でwrite停止。古いasync importを破棄 | 原子的な複数タブ合意はDBなしでは保証不可 |
| 12 | 一部採用 | 排他的ScreenController、editor/replay/learning表示、storage/download/cache/localeを分離。遷移テスト追加、mainはcoverage対象を維持 | mainの入力イベント全分割・手番/観戦を含む全状態機械化は別の整理へ |
| 13 | 一部採用 | CPU skipを1命令ずつyield、既存scheduler世代取消、JSON/replay仕事量予算、編集32×32/128部隊。Nodeで通常/最大初期盤面を計測 | Worker化・ブラウザー上の最悪交戦状態p95/最大メモリは後回し。保証値として扱わない |
| 14 | 採用 | 形式とプレイ検査を分離。空軍、陸上艦船、司令部欠落、保持/占領への静的到達性、生産/航空補給を理由/座標付き表示。全組込みは警告なし | 輸送可能時の警告は保守的。動的な必勝性判定はしない。警告は上級者が開始可、形式/予算エラーは不可 |
| 15 | 採用 | 一覧編集/複製/削除/改名、brush/fill/rectangle/対称、100段undo/redo、resize/theme/複数目標。上書きに旧保存保護 | 敗北条件を含む高度な全編集はJSON欄も使用 |
| 16 | 一部採用 | hold/survive/score目標、地上APC輸送/補給、生産、損耗合流、選択理由trace。fixtureと全マップ3難易度の合法性回帰 | 観測役と間接砲の長期協調計画は後回し。hardが全マップで強化されたとの主張はしない |
| 17 | 採用（自動比較） | 完全SHA/3seed/陣営交換/マップ別18局の比較。両版18/18決着。判定比率・生産等も記録 | 人間の時間/公平感は未評価。より大きい標本での難易度順序は未保証 |
| 18 | 一部採用 | 専用練習作戦、6段階ヒントと達成記録、再表示、兵科表、補給/修理/収入/判定説明。既存行動不可理由を維持 | 初心者・経験者の人によるプレイテスト、3〜5分で終わる保証、補給経路の地図表示は未実施 |
| 19 | 一部採用 | 360/430/横向き、200% root文字、keyboard、3ブラウザーsmoke追加。Escapeと世代付きfocus、縮むgrid、44px補助操作 | 自動smokeの結果を下記で管理。実機タッチ/読み上げ/全色コントラスト監査は未実施 |
| 20 | 採用 | 最大32checkpoint、手数seek/back、公開視点のイベント一覧、終了対局の全体視点、携帯snapshot。全再生との一致試験 | なし |
| 21 | 採用 | 新規境界回帰、node/jsdom分離、fast/CPU/dist UIの実行分割。dist対象E2Eとtrace保存。新規sourceを自動format対象 | 既存未整形60ファイルは個別名を凍結し整形専用変更へ。新規glob除外なし。閾値/既存20 E2Eを維持 |
| 22 | 採用（監査例外あり） | engines/npm/Node、SHA-pin、Dependabot、license棚卸し、build version。high修正、prod監査0 | Vitest開発依存moderate連鎖3件の期限付き例外。2026-10-16再評価 |
| 23 | 一部採用・反映待ち | v0.1.0訂正文、将来template、歴史資料の注記、v4保存仕様を追加 | GitHub Release本文は未ログインで未更新。訂正文をそのまま適用できる |
| 24 | 一部採用 | typed主要文言ja/en、操作/aria辞書、兵科/地形名、command error、Intl日時/数値、永続言語選択 | tutorial/editor詳細・保存parserエラー・動的ariaの全文英訳は後回し。作者の名称/本文とIDは保持 |
| 25 | 一部採用 | 可視画素一致のWebP、lazydecode、version/SHA、利用者選択のローカル診断。転送サイズ比較 | PWAは見送り、オフライン保証なし。壊れた原背景の再圧縮は素材確認まで後回し |
| 26 | 採否記録完了 | 対称描画だけ採用。ZOC既存結果、潜航の観測設計を踏まえ[候補ごとの仮説/互換/fixture/判断](reviews/2026-10-02-expansion-decisions.md)を記録 | 新ルール/新campaign/オンラインは未実装。承認なきサーバー/認証/費用を導入しない |

## 状態遷移と副作用

| 入力 | 遷移 | 保護 |
| --- | --- | --- |
| タイトル→作戦選択/練習 | title→briefing→battle | 既存進行があれば置換確認 |
| エディタ/キャンペーンを開く | 現在modalを単一のeditor/campaignへ | 無効な複数modal状態を作らない。戻り先を保持 |
| エディタ/キャンペーンを閉じる・Escape | battleまたはtitle/briefingへ | 下書き/対局は保持 |
| 保存load / file import | 成功時のみcommit | 失敗時は状態不変。古いasync完了は適用しない |
| CPU skip / タイトル/別タブ切替 | 命令間でyield・scheduler取消 | 取消済み処理と旧renderのfocusを適用しない |
| hotseat handoff / spectate | matchControlで命令可否を制御 | 受渡し遮蔽と停止resumeを維持 |
| replay終了 | 元のgameへ復帰 | 対局中の相手情報は解禁しない |

## 検証と測定

- 単体/回帰: 最終CIで全ケースとcoverageを確認。mainを対象から外さず、閾値 statements/lines 69、branches 90、functions 94を維持。
- 配布UI: built distを起動する独立7ケース。保存getter不可・名前付き開始・破損load状態保全・エディタ・置換取消/Escape・英語・他タブ。
- ブラウザー: 従来20ケースを保持し、4 smoke × Chromium/Firefox/WebKit = 32ケース。初回E2Eは横はみ出し/キーfocus/新確認対応を検出、修正して再実行中。最終結果はPRの同一head CIで確認する。
- ローカルのPlaywright browser取得は不完全なarchiveで失敗したため、実ブラウザー検証はGitHub Actionsで実行。jsdomを実機検証と扱わない。
- [18局比較](reviews/2026-10-02-balance-comparison.md): 対象ゲームSHA `4f653d9f613a2706ad5b3142ed09b8c3e1468012`、両版全局決着。
- [性能生データ](reviews/2026-10-02-performance.json): Node24/Linux、12保存×150手、cold20回中央値27.89ms/p95 68.29ms、cached100回中央値0.028ms/p95 0.096ms。通常CPU20回p95 3.69ms、32×32/128部隊の初期配置10回p95 9.51ms。heap差はGCを含み、最大メモリではない。
- 再現: `npx vite-node scripts/profile-boundaries.ts`。ブラウザー描画/スマートフォンの入力待ちを計測した値ではない。大盤面の密集交戦全体を保証しない。
- [依存/素材/配信と監査例外](reviews/2026-10-02-dependency-delivery.md)、[保存互換性](persistence-schema.md)、[訂正版ノート](releases/v0.1.0.md)を参照。
