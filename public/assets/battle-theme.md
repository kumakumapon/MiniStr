# Battle theme

`battle-theme.ogg` は MiniStr 用に作曲・合成したオリジナル音源です。
既存ゲームの楽曲や外部の録音サンプルは使用していません。リポジトリと同じ MIT ライセンスで配布します。

- 168 BPM、ニ短調、16小節、約22.86秒のループ
- 音の切れと立ち上がりを強めた勇ましい金管（オクターブ重ね）の旋律、低弦の16分刻み、サブベース、弦・合唱風パッド
- タイコ（太鼓）・キック・スネア・ハイハット・シンバル、スネアのフラムと装飾打音、8小節ごとのスネアロールを波形とノイズから合成
- ステレオの残響（ループ境界で尾が折り返され、つなぎ目が目立たない）
- Ogg Vorbis / 44.1 kHz / stereo / quality 3、約304 KiB。エンコード時に -4.9 dB 調整
- 生成: 出力用ディレクトリで `node /path/to/scripts/generate-music.mjs battle frontier`、続けて `ffmpeg -i battle.wav -af volume=-4.9dB -c:a libvorbis -q:a 3 battle-theme.ogg`

戦闘開始時に冒頭から再生し、戦闘終了・スキップ時には通常曲の続きへ戻ります。
発射・着弾・撃破の効果音は音源に混ぜず、Web Audio でアニメーションに合わせて再生します。
