# Dawn theme

`dawn-theme.ogg` は MiniStr 用に作曲・合成したオリジナル音源です。
外部の楽曲や録音サンプルは使用していません。リポジトリと同じ MIT ライセンスで配布します。

- 136 BPM、ニ長調、16小節、約28.24秒のループ
- 凱旋を思わせる金管と弦の旋律、16分のハープ、刻む低音、行進スネア
- 短い立ち上がりと残響で拍を明瞭にし、ループ境界に残響を折り返す
- Ogg Vorbis / 44.1 kHz / stereo / quality 3、約373 KiB
- 生成: 出力先ディレクトリで `node /path/to/scripts/generate-music.mjs dawn drive wasteland mist` を実行
- 書き出し: `ffmpeg -i dawn.wav -af volume=-5dB -c:a libvorbis -q:a 3 dawn-theme.ogg`
- 再生速度の変更は使用せず、上記テンポで再合成（2026-10-15）
