# Mist theme

`mist-theme.ogg` は MiniStr 用に作曲・合成したオリジナル音源です。
外部の楽曲や録音サンプルは使用していません。リポジトリと同じ MIT ライセンスで配布します。

- 132 BPM、ヘ長調系、16小節、約29.09秒のループ
- ベルと短いエコー、決意を感じる金管、16分の弦と低音、規則的な太鼓とスネア
- 短い立ち上がりと残響で拍を明瞭にし、ループ境界に残響を折り返す
- Ogg Vorbis / 44.1 kHz / stereo / quality 3、約389 KiB
- 生成: 出力先ディレクトリで `node /path/to/scripts/generate-music.mjs dawn drive wasteland mist` を実行
- 書き出し: `ffmpeg -i mist.wav -af volume=-5dB -c:a libvorbis -q:a 3 mist-theme.ogg`
- 再生速度の変更は使用せず、上記テンポで再合成（2026-10-15）
