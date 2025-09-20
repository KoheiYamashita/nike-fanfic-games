export enum Level {
  Skull = 1, // スカル
  Haniwa = 2, // 埴輪
  Pixel = 3, // ピクセル
  Punk = 4, // パンクロック
  Punike = 5, // ぷにけ
}

// デプロイ先に応じてモデル配信のベースURLを切り替え
// 例: Cloudflare R2 を使うなら VITE_ASSET_BASE=https://<your-r2-domain>/
const RAW_BASE = (import.meta as any).env?.VITE_ASSET_BASE ?? (import.meta as any).env?.BASE_URL ?? '/';
const ASSET_BASE = RAW_BASE.endsWith('/') ? RAW_BASE : RAW_BASE + '/';

export const LEVEL_ORDER: Level[] = [
  Level.Skull,
  Level.Haniwa,
  Level.Pixel,
  Level.Punk,
  Level.Punike,
];

export const LEVEL_RADIUS: Record<Level, number> = {
  [Level.Skull]: 0.30,
  [Level.Haniwa]: 0.40,
  [Level.Pixel]: 0.52,
  [Level.Punk]: 0.66,
  [Level.Punike]: 0.82,
};

export const SCORE_TABLE: Partial<Record<Level, number>> = {
  [Level.Skull]: 5, // -> Haniwa
  [Level.Haniwa]: 12, // -> Pixel
  [Level.Pixel]: 28, // -> Punk
  [Level.Punk]: 64, // -> Punike
};

export type ModelSpec = {
  level: Level;
  name: string;
  file: string; // public path to GLB
};

// GLBファイル名とレベル対応
export const MODELS: ModelSpec[] = [
  { level: Level.Skull,  name: "スカルぷにけ",   file: `${ASSET_BASE}model/スカルぷにけ.glb` },
  { level: Level.Haniwa, name: "埴輪ぷにけ",     file: `${ASSET_BASE}model/埴輪ぷにけ.glb` },
  { level: Level.Pixel,  name: "ピクセルぷにけ", file: `${ASSET_BASE}model/ピクセルぷにけ.glb` },
  { level: Level.Punk,   name: "パンクロックぷにけ", file: `${ASSET_BASE}model/パンクロックぷにけ.glb` },
  { level: Level.Punike, name: "ぷにけ",         file: `${ASSET_BASE}model/ぷにけ.glb` },
];

export const SPAWN_WEIGHTS: Array<{ level: Level; w: number }> = [
  { level: Level.Skull, w: 0.5 },
  { level: Level.Haniwa, w: 0.3 },
  { level: Level.Pixel, w: 0.2 },
];

export const CONTAINER = {
  innerDiameter: 2.6,
  height: 3.6,
  spawnY: 2.9,
  xMin: -1.1,
  xMax: 1.1,
  warnY: 1.9,
};

export const PHYSICS = {
  gravity: -9.81,
  restitution: 0.25,
  friction: 0.3,
  rollingFriction: 0.01,
  sleepLin: 0.05,
  sleepAng: 0.05,
  sleepTime: 0.6,
};

export const INPUT = {
  // 指離し（pointerup）でドロップ: ボタン運用に合わせて無効
  dropOnPointerUp: false,
};
