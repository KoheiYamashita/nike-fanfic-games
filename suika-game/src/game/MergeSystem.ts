import type * as CANNON from 'cannon-es';
import { Level, LEVEL_ORDER, LEVEL_RADIUS, SCORE_TABLE } from '../config';
import type { PhysicsWorld, BodyTag } from './Physics';

export type MergeEvent = {
  from: { a: CANNON.Body; b: CANNON.Body; level: Level };
  to: { level: Level; x: number; y: number; z: number; vx: number; vy: number; vz: number };
  score: number;
};

// 簡易版: フレーム毎に接触中の同レベル球を距離昇順で1回マージ
export class MergeSystem {
  events: MergeEvent[] = [];
  private cooldown = new WeakMap<CANNON.Body, number>();

  constructor(private phys: PhysicsWorld) {}

  update(dt: number) {
    const now = performance.now() / 1000;
    const pairs: Array<{ a: CANNON.Body; b: CANNON.Body; level: Level; d2: number }>= [];

    const worldAny: any = this.phys.world as any;
    const narrow: any | undefined = worldAny.narrowphase;
    const contactEquations: any[] | undefined = narrow?.contactEquations;

    if (Array.isArray(contactEquations)) {
      for (const c of contactEquations) {
        const A = c.bi; const B = c.bj;
        const ta = (A as any).tag as BodyTag | undefined;
        const tb = (B as any).tag as BodyTag | undefined;
        if (!ta || !tb) continue;
        if (ta.kind !== 'ball' || tb.kind !== 'ball') continue;
        if (ta.level !== tb.level) continue;

        const cdA = this.cooldown.get(A) ?? 0;
        const cdB = this.cooldown.get(B) ?? 0;
        if (cdA > now || cdB > now) continue;

        const d2 = A.position.vsub(B.position).lengthSquared();
        pairs.push({ a: A, b: B, level: ta.level, d2 });
      }
    } else {
      // フォールバック: 全ボールから距離判定で近接ペアを抽出
      const balls = this.phys.world.bodies.filter((b: any) => !!b.tag && (b.tag as BodyTag).kind === 'ball');
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const A = balls[i]; const B = balls[j];
          const ta = (A as any).tag as BodyTag; const tb = (B as any).tag as BodyTag;
          if (ta.level !== tb.level) continue;

          const delta = A.position.vsub(B.position);
          const d2 = delta.lengthSquared();
          const r = LEVEL_RADIUS[ta.level] + LEVEL_RADIUS[tb.level];
          if (d2 > (r * r) * 1.02) continue; // 少しだけバッファ

          const cdA = this.cooldown.get(A) ?? 0;
          const cdB = this.cooldown.get(B) ?? 0;
          if (cdA > now || cdB > now) continue;

          pairs.push({ a: A, b: B, level: ta.level, d2 });
        }
      }
    }

    pairs.sort((p, q) => p.d2 - q.d2);

    const used = new Set<CANNON.Body>();
    for (const p of pairs) {
      if (used.has(p.a) || used.has(p.b)) continue;
      const next = this.nextLevel(p.level);
      if (!next) continue;
      used.add(p.a); used.add(p.b);

      const pa = p.a.position; const pb = p.b.position;
      const va = p.a.velocity; const vb = p.b.velocity;
      const mA = p.a.mass; const mB = p.b.mass;
      const mx = (pa.x * mA + pb.x * mB) / (mA + mB);
      const my = (pa.y * mA + pb.y * mB) / (mA + mB);
      const mz = (pa.z * mA + pb.z * mB) / (mA + mB);
      const vx = (va.x * mA + vb.x * mB) / (mA + mB);
      const vy = (va.y * mA + vb.y * mB) / (mA + mB);
      const vz = (va.z * mA + vb.z * mB) / (mA + mB);

      const score = SCORE_TABLE[p.level] ?? 0;

      this.events.push({
        from: { a: p.a, b: p.b, level: p.level },
        to: { level: next, x: mx, y: my + 0.01, z: mz, vx, vy, vz },
        score,
      });

      // 合体クールダウン（短めにして連鎖を即時に）
      const t = now + 0.05;
      this.cooldown.set(p.a, t);
      this.cooldown.set(p.b, t);
    }
  }

  consume(): MergeEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private nextLevel(l: Level): Level | null {
    const i = LEVEL_ORDER.indexOf(l);
    if (i < 0 || i >= LEVEL_ORDER.length - 1) return null;
    return LEVEL_ORDER[i + 1];
  }
}
