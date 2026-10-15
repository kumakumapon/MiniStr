# Frontier theme

`frontier-theme.ogg` は MiniStr 用に作曲・合成したオリジナル音源です。
外部の楽曲や録音サンプルは使用していません。リポジトリと同じ MIT ライセンスで配布します。

- 144 BPM、ニ短調、16小節、約26.67秒のループ（勇壮でテンポのよい行進曲）
- 立ち上がりと音の切れを明確にしたホルンの付点リズム、オクターブ重ね、強拍に応答する金管和音。後半は高音のトランペット風を追加
- 冒頭から16分で刻む低弦、サブベースの8分パルス、控えめな弦パッド、ハープ風アルペジオ
- 太鼓・キック・強めのスネアの行進リズム、弱いスネアの装飾打音、4小節ごとのシンバル、8・16小節目のスネアロール
- ステレオの残響。ループ境界で尾が折り返され、つなぎ目が目立たない
- Ogg Vorbis / 44.1 kHz / stereo / quality 3、約359 KiB。エンコード時に -5 dB 調整
- 生成: 出力用ディレクトリで `node /path/to/scripts/generate-music.mjs battle frontier`、続けて `ffmpeg -i frontier.wav -af volume=-5dB -c:a libvorbis -q:a 3 frontier-theme.ogg`
