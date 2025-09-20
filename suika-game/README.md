# Suika 3D Clone (Node + Vite + three.js)

3D版「すいかゲーム」のクローン実装。GLBモデルを表示しつつ、球体物理（cannon-es）で積み上げ＆同種接触で合体するミニゲーム。

## 特徴
- three.js + cannon-es で軽量実装（TS/Vite）
- 当たった瞬間に合体（即時マージ、連鎖対応）
- レベル順: スカル → 埴輪 → ピクセル → パンクロック → ぷにけ（サイズ拡大）
- 操作はボタンのみ（ドラッグ無効）: 左/前/後/右 + DROP
- プレビュー: 上部に落下位置プレビュー、右上にNext 3Dモデル
- ゲームオーバー: 警告ライン越えで静止、または1.5秒連続越え

## セットアップ
- 依存インストール＆起動
  - `cd suika-game`
  - `npm install`
  - `npm run dev`
  - ブラウザで `http://localhost:5173/`

- Git LFS（モデル取得）
  - 初回のみ: `git lfs install`
  - LFSで管理: `suika-game/public/model/*.glb`
  - うまく表示されない場合は `git lfs pull` を実行

## 操作
- 左右移動: 画面下の `◀ / ▶`
- 前後移動: `▲ / ▼`（▲=奥、▼=手前）
- 落下: `DROP` ボタン
