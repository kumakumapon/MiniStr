# 蒼雷 / Blue Thunder

`rock-blue-theme.ogg` はMiniStr用に作曲・合成したオリジナルのロック調BGMです。外部楽曲・録音サンプルは使用せず、リポジトリと同じMITライセンスで配布します。

- 148 BPM、ホ短調を基調、4拍子16小節、約25.95秒のループ
- 合成した歪みギターのパワーコードを左右へ重ね、シンセベース・バックビート・ハイハット・フィルを加える構成
- 低音リフ、裏拍のキックとスネア、応答するリード
- 折り返す残響と両端4msの滑らかな窓で境界のクリックを抑制
- Ogg Vorbis、44.1 kHz、ステレオ、quality 3、-5dBで書き出し
- 両軍のどちらにも設定可能。音量・ミュートは既存のBGM設定と共通

```sh
# 出力先ディレクトリで実行。各曲の乱数seedは独立しています。
node /path/to/scripts/generate-music.mjs rock-red rock-blue
ffmpeg -i rock-blue.wav -af volume=-5dB -c:a libvorbis -q:a 3 rock-blue-theme.ogg
```

WAVは同じ生成スクリプトから再現できます。Oggのコンテナ識別子はエンコーダが割り当てるため、再エンコード後のバイト列一致は要件としません。実行結果は[v0.9.4の確認記録](../../docs/reviews/2026-10-24-presentation.md)を参照してください。
