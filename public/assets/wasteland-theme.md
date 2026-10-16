# Wasteland theme

`wasteland-theme.ogg` は MiniStr 用に作曲・合成したオリジナル音源です。
外部の楽曲や録音サンプルは使用していません。リポジトリと同じ MIT ライセンスで配布します。

- 144 BPM、ホ短調、16小節、約26.67秒のループ
- ギター風アルペジオと口笛の音色、騎兵の駆け足を思わせる低音、金管と行進スネア
- 短い立ち上がりと残響で拍を明瞭にし、ループ境界に残響を折り返す
- Ogg Vorbis / 44.1 kHz / stereo / quality 3、約356 KiB
- 生成: 出力先ディレクトリで `node /path/to/scripts/generate-music.mjs dawn drive wasteland mist` を実行
- 書き出し: `ffmpeg -i wasteland.wav -af volume=-5dB -c:a libvorbis -q:a 3 wasteland-theme.ogg`
- 再生速度の変更は使用せず、上記テンポで再合成（2026-10-15）
