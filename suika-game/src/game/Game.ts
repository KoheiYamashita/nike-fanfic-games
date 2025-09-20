import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as CANNON from 'cannon-es';
import { CONTAINER, Level, LEVEL_ORDER, LEVEL_RADIUS, MODELS } from '../config';
import { PhysicsWorld } from './Physics';
import { Spawner } from './Spawner';
import { MergeSystem } from './MergeSystem';

type Ball = {
  body: CANNON.Body;
  mesh: THREE.Object3D;
  level: Level;
};

export class Game {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  light: THREE.DirectionalLight;
  phys = new PhysicsWorld();
  merge = new MergeSystem(this.phys);
  spawner: Spawner;
  clock = new THREE.Clock();
  models = new Map<Level, THREE.Object3D>();
  balls: Ball[] = [];
  nextLevel: Level;
  score = 0;
  high = 0;
  preview: THREE.Object3D | null = null;
  miniRenderer: THREE.WebGLRenderer | null = null;
  miniScene: THREE.Scene | null = null;
  miniCamera: THREE.PerspectiveCamera | null = null;
  nextMesh: THREE.Object3D | null = null;
  isGameOver = false;
  dangerAccum = 0;

  constructor(private mount: HTMLElement) {
    const seed = new URL(location.href).searchParams.get('seed') ?? undefined;
    this.spawner = new Spawner(seed);
    this.nextLevel = Level.Skull;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x5A4C97);
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 3.8, 4.2);
    this.camera.lookAt(0, 1.4, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    this.light = new THREE.DirectionalLight(0xffffff, 0.9);
    this.light.position.set(2, 5, 3);
    this.scene.add(this.light);

    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(CONTAINER.innerDiameter / 2, CONTAINER.innerDiameter / 2, 0.02, 48),
      new THREE.MeshStandardMaterial({ color: 0x1c243a })
    );
    ground.position.set(0, 0, 0);
    this.scene.add(ground);

    // 警告ライン表示（ガイド）
    const warnGeo = new THREE.RingGeometry( CONTAINER.innerDiameter/2*0.98, CONTAINER.innerDiameter/2, 64 );
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, transparent: true, opacity: 0.15 });
    const warn = new THREE.Mesh(warnGeo, warnMat);
    warn.rotation.x = Math.PI / 2;
    warn.position.y = CONTAINER.warnY;
    this.scene.add(warn);

    this.handleResize();
    addEventListener('resize', () => this.handleResize());

    this.bindButtons();

    this.loadModels().then(() => {
      this.rollNext();
      this.updatePreview();
      this.setupNextRenderer();
      this.updateNextPreview();
      this.animate();
    });
    this.bindRestart();
  }

  async loadModels() {
    const loader = new GLTFLoader();
    for (const m of MODELS) {
      const gltf = await loader.loadAsync(m.file);
      const obj = gltf.scene;
      // 正規化（BoundingSphere半径=1）→ 物理半径にスケール
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const normScale = 1 / (maxDim > 0 ? maxDim : 1);
      obj.scale.setScalar(normScale);
      this.models.set(m.level, obj);
    }
  }

  spawn(level: Level, x: number, z: number) {
    const y = CONTAINER.spawnY;
    const body = this.phys.addBall(level, x, y, z);
    const tmpl = this.models.get(level)!.clone(true);
    const mesh = new THREE.Group();
    mesh.add(tmpl);
    const r = LEVEL_RADIUS[level];
    mesh.scale.setScalar(r * 2); // 前段で1に正規化している前提
    this.scene.add(mesh);
    this.balls.push({ body, mesh, level });
  }

  animate = () => {
    const dt = this.clock.getDelta();
    if (!this.isGameOver) {
      this.phys.step(dt);
      this.merge.update(dt);
    }

    // 合体イベントの適用
    for (const ev of this.merge.consume()) {
      // 既存メッシュ削除
      this.removeBallByBody(ev.from.a);
      this.removeBallByBody(ev.from.b);
      const b = this.phys.addBall(ev.to.level, ev.to.x, ev.to.y, ev.to.z);
      b.velocity.set(ev.to.vx, ev.to.vy, ev.to.vz);
      const mesh = this.models.get(ev.to.level)!.clone(true);
      const g = new THREE.Group(); g.add(mesh);
      g.scale.setScalar(LEVEL_RADIUS[ev.to.level] * 2);
      this.scene.add(g);
      this.balls.push({ body: b, mesh: g, level: ev.to.level });
      this.addScore(ev.score);
    }

    // メッシュ追従
    for (const b of this.balls) {
      const p = b.body.position;
      const q = b.body.quaternion as any;
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }

    // プレビュー位置の追従
    if (this.preview) {
      this.preview.position.x = this.spawner.x;
      this.preview.position.y = CONTAINER.spawnY;
      this.preview.position.z = this.spawner.z;
    }

    // 警告ラインの監視 + ゲームオーバー
    const warnEl = document.getElementById('warn')!;
    // ライン内側に一度入った（entered=true）個体のみを対象にする
    for (const b of this.balls) {
      const tag: any = (b.body as any).tag;
      if (tag && !tag.entered) {
        const bottom = b.body.position.y - LEVEL_RADIUS[b.level];
        if (bottom < (CONTAINER.warnY - 0.02)) tag.entered = true;
      }
    }
    const eligible = this.balls.filter(b => (b.body as any).tag?.entered);
    const anyOver = eligible.some(b => (b.body.position.y + LEVEL_RADIUS[b.level]) > CONTAINER.warnY);
    warnEl.style.opacity = anyOver ? '1' : '0';
    if (!this.isGameOver) {
      const settledOver = eligible.some(b => (b.body.position.y + LEVEL_RADIUS[b.level]) > CONTAINER.warnY && b.body.velocity.length() < 0.02);
      if (settledOver) {
        this.endGame();
      } else if (anyOver) {
        this.dangerAccum += dt;
        if (this.dangerAccum > 1.5) this.endGame();
      } else {
        this.dangerAccum = Math.max(0, this.dangerAccum - dt * 0.5);
      }
    }

    this.renderer.render(this.scene, this.camera);
    if (this.miniRenderer && this.miniScene && this.miniCamera) {
      this.miniRenderer.render(this.miniScene, this.miniCamera);
    }
    requestAnimationFrame(this.animate);
  };

  removeBallByBody(body: CANNON.Body) {
    const i = this.balls.findIndex(b => b.body === body);
    if (i >= 0) {
      const [rm] = this.balls.splice(i, 1);
      this.scene.remove(rm.mesh);
      this.phys.removeBody(rm.body);
    }
  }

  rollNext() {
    this.nextLevel = this.spawner.nextLevel();
    this.updatePreview();
    this.updateNextPreview();
  }

  addScore(s: number) {
    this.score += s;
    const h = Number(localStorage.getItem('suika3d_high') || '0');
    this.high = Math.max(h, this.score);
    localStorage.setItem('suika3d_high', String(this.high));
    (document.getElementById('score')!).textContent = `Score: ${this.score}`;
    (document.getElementById('high')!).textContent = `High: ${this.high}`;
  }

  bindButtons() {
    const left = document.getElementById('left')!;
    const right = document.getElementById('right')!;
    const forward = document.getElementById('forward')!;
    const back = document.getElementById('back')!;
    const drop = document.getElementById('drop')!;
    let dirX = 0, dirZ = 0;
    const speed = 1.5; // m/s
    const updatePos = () => {
      if (!this.isGameOver && (dirX !== 0 || dirZ !== 0)) {
        this.spawner.nudge(dirX * speed / 60, dirZ * speed / 60);
      }
      requestAnimationFrame(updatePos);
    };
    updatePos();
    left.onpointerdown = () => dirX = -1;
    left.onpointerup = left.onpointercancel = () => dirX = 0;
    right.onpointerdown = () => dirX = 1;
    right.onpointerup = right.onpointercancel = () => dirX = 0;
    forward.onpointerdown = () => dirZ = -1; // 奥へ（カメラから遠ざかる）
    forward.onpointerup = forward.onpointercancel = () => dirZ = 0;
    back.onpointerdown = () => dirZ = 1; // 手前へ（カメラ側）
    back.onpointerup = back.onpointercancel = () => dirZ = 0;
    drop.onclick = () => { if (!this.isGameOver) this.dropCurrent(); };
  }

  // 画面ドラッグ操作は無効（ボタンのみ）

  dropCurrent() {
    this.spawn(this.nextLevel, this.spawner.x, this.spawner.z);
    this.rollNext();
  }

  private makePreview(level: Level) {
    const base = this.models.get(level);
    if (!base) return null;
    const g = new THREE.Group();
    const clone = base.clone(true);
    clone.traverse((obj: any) => {
      if (obj.isMesh) {
        const mat = (obj.material && obj.material.clone) ? obj.material.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
        // 透過は不要：不透明で描画
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.depthWrite = true;
        obj.material = mat;
      }
    });
    g.add(clone);
    g.scale.setScalar(LEVEL_RADIUS[level] * 2);
    g.position.set(this.spawner.x, CONTAINER.spawnY, this.spawner.z);
    return g;
  }

  private updatePreview() {
    if (!this.models.size) return;
    if (this.preview) {
      this.scene.remove(this.preview);
      this.preview = null;
    }
    const p = this.makePreview(this.nextLevel);
    if (p) {
      this.preview = p;
      this.scene.add(p);
    }
  }

  handleResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  private endGame() {
    this.isGameOver = true;
    const overlay = document.getElementById('gover');
    overlay?.classList.add('show');
  }

  private bindRestart() {
    const btn = document.getElementById('restart');
    btn?.addEventListener('click', () => this.restart());
  }

  private restart() {
    // 既存ボールのメッシュをシーンから除去＆破棄
    for (const b of this.balls) {
      this.scene.remove(b.mesh);
      this.disposeObject(b.mesh);
    }
    this.balls.length = 0;

    // プレビューも消す
    if (this.preview) {
      this.scene.remove(this.preview);
      this.disposeObject(this.preview);
      this.preview = null;
    }

    // 物理世界を作り直してクリーンに
    this.phys = new PhysicsWorld();
    this.merge = new MergeSystem(this.phys);
    this.isGameOver = false;
    this.dangerAccum = 0;
    (document.getElementById('warn')!).style.opacity = '0';
    document.getElementById('gover')?.classList.remove('show');
    // スコアリセット
    this.score = 0;
    (document.getElementById('score')!).textContent = `Score: ${this.score}`;
    // スポーン位置初期化 & プレビュー更新
    this.spawner.setXZAbsolute(0, 0);
    this.rollNext();
    this.updatePreview();
    this.updateNextPreview();
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((child: any) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const m of child.material) m?.dispose?.();
        } else {
          child.material?.dispose?.();
        }
      }
    });
  }

  private setupNextRenderer() {
    const host = document.getElementById('next');
    if (!host) return;
    // 既存テキストをクリア
    host.textContent = '';
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(1);
    const w = host.clientWidth || 96;
    const h = host.clientHeight || 96;
    r.setSize(w, h, false);
    host.appendChild(r.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, w / h, 0.01, 10);
    cam.position.set(1.2, 0.8, 1.8);
    cam.lookAt(0, 0.3, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(2, 3, 2);
    scene.add(dl);
    this.miniRenderer = r;
    this.miniScene = scene;
    this.miniCamera = cam;
  }

  private updateNextPreview() {
    if (!this.miniScene || !this.miniRenderer) return;
    if (this.nextMesh) {
      this.miniScene.remove(this.nextMesh);
      this.nextMesh = null;
    }
    const base = this.models.get(this.nextLevel);
    if (!base) return;
    const g = new THREE.Group();
    const clone = base.clone(true);
    // 中心合わせ
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3(); box.getCenter(center);
    clone.position.sub(center);
    g.add(clone);
    g.scale.setScalar(1.2); // ビューポートに合うよう軽く拡大
    this.miniScene.add(g);
    this.nextMesh = g;
  }
}
