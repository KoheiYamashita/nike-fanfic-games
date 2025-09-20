import * as CANNON from 'cannon-es';
import { CONTAINER, LEVEL_RADIUS, Level, PHYSICS } from '../config';

export type BodyTag = {
  kind: 'ball';
  level: Level;
  id: number;
  bornAt: number; // spawn時刻（秒）
  entered: boolean; // 警告ライン内側に一度でも入ったか
};

export class PhysicsWorld {
  world: CANNON.World;
  nextId = 1;
  containerBodies: CANNON.Body[] = [];

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.defaultContactMaterial = new CANNON.ContactMaterial(
      new CANNON.Material('default'),
      new CANNON.Material('default'),
      { restitution: PHYSICS.restitution, friction: PHYSICS.friction }
    );
    this.setupContainer();
  }

  setupContainer() {
    const r = CONTAINER.innerDiameter / 2;
    const h = CONTAINER.height;
    const wallThick = 0.05;
    const segments = 24;

    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.containerBodies.push(ground);

    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      const wall = new CANNON.Body({ mass: 0 });
      wall.addShape(new CANNON.Box(new CANNON.Vec3(wallThick, h / 2, r * Math.PI / segments)));
      wall.position.set(r * nx, h / 2, r * nz);
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, -theta, 0, 'XYZ');
      wall.quaternion.copy(q);
      this.world.addBody(wall);
      this.containerBodies.push(wall);
    }
  }

  step(dt: number) {
    // サブステップ2～3で安定化
    const fixed = 1 / 60;
    this.world.step(fixed, dt, 3);
  }

  addBall(level: Level, x: number, y: number, z = 0) {
    const r = LEVEL_RADIUS[level];
    const shape = new CANNON.Sphere(r);
    const density = 1.0;
    const mass = (4 / 3) * Math.PI * r * r * r * density;
    const b = new CANNON.Body({ mass });
    b.addShape(shape);
    b.position.set(x, y, z);
    b.sleepSpeedLimit = PHYSICS.sleepLin;
    b.sleepTimeLimit = PHYSICS.sleepTime;
    (b as any).tag = { kind: 'ball', level, id: this.nextId++, bornAt: performance.now() / 1000, entered: false } as BodyTag;
    this.world.addBody(b);
    return b;
  }

  removeBody(b: CANNON.Body) {
    this.world.removeBody(b);
  }
}
