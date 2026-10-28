# 依存・CI整備（v1.1.0公開後）

関連: #168（項目19・20）、#155（項目08・22）。基準はv1.1.0 / 5094dfdea79a559a510e0a09290a8bc6b26498a4。本PRは依存と検証・公開運用の整備で、ゲーム規則・UI・保存形式・アプリ版番号は変更しません。

## 実施範囲

1. 開いている依存更新PRを照合し、ESLint・Playwright・Vite・Node型・TypeScriptとtypescript-eslintを互換性のある組み合わせにする。TypeScript 7のpeer不整合を強制オプションで回避しない。
2. checkout・setup-node・upload-artifact・upload-pages-artifact・deploy-pagesを更新し、SHA固定を維持する。Node 22/24の対応範囲とnpmの運用を揃える。
3. CIとPagesの重複検証を整理。mainの自動公開とmainからの手動公開は同じ品質ゲートを通し、feature手動検証でmainの公開を取消しない。PRのread-only権限・Secret非利用・コミット/ファイルリンク検査を維持する。
4. クリーンインストール、依存整合性、最新の全依存/本番監査、lint・整形・テスト型・カバレッジ・ビルド・UI・3ブラウザを検証する。CIの分岐と公開条件も回帰確認する。
5. 変更理由・監査・未採用の更新・検証結果を記録し、成功後にドラフトを解除する。mainへのマージ・実際のPages公開は別途確認する。

## 環境

作業環境はnpmレジストリ接続が制限されているため、既存のGitHub接続とread-onlyのActionsでメタデータ・lockfileの生成と検証を行う。生成物を取り込み、一時生成ステップを削除した後、コミット済みlockfileに対するnpm ciを正式な最終検証とする。監査・テストの未実行を成功扱いしない。
