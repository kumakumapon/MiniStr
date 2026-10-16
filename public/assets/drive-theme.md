# Drive theme

`drive-theme.ogg` は MiniStr 用に作曲・合成したオリジナル音源です。
外部の楽曲や録音サンプルは使用していません。リポジトリと同じ MIT ライセンスで配布します。

- 156 BPM、イ短調、16小節、約24.62秒のループ
- 四つ打ちと16分のシンセベース、冒頭からの金管ファンファーレ、短いコードスタブとスネアロール
- 短い立ち上がりと残響で拍を明瞭にし、ループ境界に残響を折り返す
- Ogg Vorbis / 44.1 kHz / stereo / quality 3、約345 KiB
- 生成: 出力先ディレクトリで `node /path/to/scripts/generate-music.mjs dawn drive wasteland mist` を実行
- 書き出し: `ffmpeg -i drive.wav -af volume=-5dB -c:a libvorbis -q:a 3 drive-theme.ogg`
- 再生速度の変更は使用せず、上記テンポで再合成（2026-10-15）
