# #168 実装・検証記録

対象: main `cb24dbbf15bc966b0838c99c2047a2a0bc6a78a9`。初期コミットは作業計画だけを登録し、ドラフトPR作成後に実装を始める。

## 完了条件

Issue #168の24項目を、実装修正・継続項目の前進・拡張案の採否記録に分けて追跡する。外部公開Release本文は利用者が操作するため、このPRから変更しない。CI/Pagesの保護・fork権限、private-link検査、画像の権利情報、既存保存形式を維持する。

- [ ] 01 WebKit keyboard/focus競合、Pages gate
- [ ] 02 backup候補検証の副作用と失敗時状態保全
- [ ] 03 custom scenario履歴の展開後セル/部隊/総仕事量予算
- [ ] 04 全入口で対話プレイの盤面/部隊/履歴上限を統一
- [ ] 05 同内容revisionの重複排除と上限からの回復
- [ ] 06 editor playability検査と勝利条件を一致
- [ ] 07 AIの即時勝利/保持目標優先と回帰
- [ ] 08 editor input/undo/redo/notice/focus、縮小時目標の扱い
- [ ] 09 replay/backup file importのrequest generation
- [ ] 10 locale・document language・未翻訳UIの整合
- [ ] 11 文字拡大・キーボード/modal/読み上げ・モバイル確認
- [ ] 12 実ブラウザの性能基準、長時間処理の分割/取消
- [ ] 13 mainの副作用分離と状態遷移モデル
- [ ] 14 壊れた入力/再現fixtureと3ブラウザの実利用経路、統合テスト
- [ ] 15 backup preview/recovery、複数保存キーの整合性
- [ ] 16 AI/balanceの目的別・陣営別fixtureと評価記録
- [ ] 17 練習の達成を操作種別から状態結果へ変更、実ユーザ評価
- [ ] 18 ゲーム/保存境界の性質ベーステスト・入力ケース
- [ ] 19 Dependabot更新と互換性/監査例外再評価
- [ ] 20 CI/Pagesの重複検証と公開concurrency設計
- [ ] 21 release/repository内文書とタグ/公開状態を整合（公開Release操作は別）
- [ ] 22 配布画像健全性と実転送の計測、診断プライバシー
- [ ] 23 Prettier除外を削減
- [ ] 24 ルール/作戦/オンライン候補の互換性・効果を評価して採否記録

## 実施メモ

変更した各項目に根拠、テスト、計測値を追記する。端末実機、人による初心者評価、外部Release更新等、この環境で実施できない操作は「未実施」と記録して達成扱いにしない。依存更新は既存Dependabot PRとの競合を先に確認し、不要な重複変更を作らない。
