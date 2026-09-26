// The street: our lot, sidewalks, the road, empty lots across it (with a swaying FOR SALE
// sign), trees and fences. Plus the Tiny Boba Shop building, built in parts for the reveal.
import * as THREE from 'three';
import { palette } from '../config/style';
import { MeshBuilder, roundedBox, cylinder, sphere, capsule, torus } from './geometry';
import { toon, flat, outline } from './materials';
import { tileTexture, signTexture } from './textures';
import { ease } from './juice';
import { CharacterRenderer, lookFromSeed, type CharLook } from './characters';
import { FACE } from './textures';

export const LOT = { minX: -7.6, maxX: 7.6, minZ: -7.3, maxZ: 7.8 };
export const SHOP_BOX = { minX: -7, maxX: 7, minZ: -7.4, maxZ: 6.4 };
const SIDEWALK = { z0: -10.6, z1: -7.3 };
const ROAD = { z0: -16.6, z1: -10.6 };
const FAR_WALK = { z0: -19.6, z1: -16.6 };

function plane(w: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  m.position.set(x, y, z);
  return m;
}

function tree(b: MeshBuilder, x: number, z: number, s = 1): void {
  b.add(cylinder(0.14 * s, 0.18 * s, 1.1 * s, 8), palette.treeTrunk, [x, 0.55 * s, z]);
  b.add(sphere(0.85 * s, 10, 7), palette.treeLeaf, [x, 1.55 * s, z]);
  b.add(sphere(0.6 * s, 8, 6), palette.treeLeaf2, [x + 0.35 * s, 1.95 * s, z + 0.2 * s]);
  b.add(sphere(0.55 * s, 8, 6), palette.treeLeaf, [x - 0.4 * s, 1.85 * s, z - 0.1 * s]);
}

function bush(b: MeshBuilder, x: number, z: number, s = 1, flower?: string): void {
  b.add(sphere(0.45 * s, 8, 6), palette.grassDark, [x, 0.3 * s, z], [0, 0, 0], [1.3, 0.8, 1]);
  b.add(sphere(0.35 * s, 8, 6), palette.treeLeaf2, [x + 0.3 * s, 0.34 * s, z + 0.1 * s], [0, 0, 0], [1, 0.8, 1]);
  if (flower) for (let i = 0; i < 4; i++) b.add(sphere(0.07 * s, 6, 5), flower, [x + (i - 1.5) * 0.18 * s, 0.6 * s, z + 0.25 * s]);
}

function fenceRun(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.6));
  const ang = Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(new THREE.BoxGeometry(0.12, 0.62, 0.08), palette.fence, [x0 + (x1 - x0) * t, 0.31, z0 + (z1 - z0) * t], [0, -ang, 0]);
  }
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  b.add(new THREE.BoxGeometry(len, 0.08, 0.05), palette.fencePost, [mx, 0.44, mz], [0, -ang, 0]);
  b.add(new THREE.BoxGeometry(len, 0.08, 0.05), palette.fencePost, [mx, 0.2, mz], [0, -ang, 0]);
}

function lamp(b: MeshBuilder, x: number, z: number): void {
  b.add(cylinder(0.06, 0.08, 2.6, 8), '#6b4a6e', [x, 1.3, z]);
  b.add(sphere(0.2, 10, 8), '#fff4c2', [x, 2.7, z]);
  b.add(cylinder(0.22, 0.12, 0.1, 10), '#6b4a6e', [x, 2.86, z]);
}

interface Pedestrian { look: CharLook; x: number; z: number; dir: number; speed: number; phase: number; lane: number }

export class World {
  readonly group = new THREE.Group();
  readonly ghost: THREE.Group;
  readonly bench: THREE.Group;
  readonly forSale: THREE.Group;
  readonly shop: {
    group: THREE.Group;
    tiles: THREE.InstancedMesh;
    tileData: { x: number; z: number; delay: number }[];
    walls: THREE.Object3D[];
    roof: THREE.Object3D;
    sign: THREE.Object3D;
    interior: THREE.Object3D[];
    seating: THREE.Object3D;
  };
  private peds: Pedestrian[] = [];
  private t = 0;
  private forSaleWiggle = 0;
  private tileM = new THREE.Matrix4();
  /** Reveal progress controls (0..1) for each shop part; driven by the reveal sequence. */
  shopProgress = { tiles: 0, walls: [0, 0, 0, 0], roof: 0, sign: 0, interior: 0 };
  shopBuilt = false;

  constructor(private chars: CharacterRenderer) {
    const g = this.group;
    // Ground: big grass, our lot plaza, sidewalks, road.
    g.add(plane(160, 160, toon(palette.grass), 0, 0, 0));
    const plaza = tileTexture(palette.plazaA, palette.plazaB, palette.plazaLine, 4);
    plaza.repeat.set((LOT.maxX - LOT.minX) / 2, (LOT.maxZ - LOT.minZ) / 2);
    const lotMat = new THREE.MeshToonMaterial({ map: plaza, color: 0xffffff });
    g.add(plane(LOT.maxX - LOT.minX, LOT.maxZ - LOT.minZ, lotMat, (LOT.minX + LOT.maxX) / 2, 0.005, (LOT.minZ + LOT.maxZ) / 2));
    const walkTex = tileTexture(palette.sidewalk, '#efdcc2', palette.sidewalkLine, 2);
    walkTex.repeat.set(40, 1.6);
    g.add(plane(80, SIDEWALK.z1 - SIDEWALK.z0, new THREE.MeshToonMaterial({ map: walkTex }), 0, 0.006, (SIDEWALK.z0 + SIDEWALK.z1) / 2));
    const farTex = walkTex.clone();
    farTex.needsUpdate = true;
    g.add(plane(80, FAR_WALK.z1 - FAR_WALK.z0, new THREE.MeshToonMaterial({ map: farTex }), 0, 0.006, (FAR_WALK.z0 + FAR_WALK.z1) / 2));
    g.add(plane(80, ROAD.z1 - ROAD.z0, toon(palette.road), 0, 0.004, (ROAD.z0 + ROAD.z1) / 2));

    const b = new MeshBuilder();
    // Flat ground decals never need outlines: a separate, cheaper mesh.
    const flatB = new MeshBuilder();
    // curbs
    flatB.add(new THREE.BoxGeometry(80, 0.12, 0.3), palette.curb, [0, 0.06, SIDEWALK.z0]);
    flatB.add(new THREE.BoxGeometry(80, 0.12, 0.3), palette.curb, [0, 0.06, FAR_WALK.z1]);
    // road dashes + crosswalk
    for (let x = -38; x < 38; x += 3) flatB.add(new THREE.BoxGeometry(1.6, 0.02, 0.2), palette.roadLine, [x, 0.012, (ROAD.z0 + ROAD.z1) / 2]);
    for (let i = 0; i < 6; i++) flatB.add(new THREE.BoxGeometry(0.5, 0.02, 5.4), '#fff8ea', [-11 + i * 0.9, 0.013, (ROAD.z0 + ROAD.z1) / 2]);
    // Side lots on our side: fenced grass with trees and bushes.
    fenceRun(b, -8.4, -7.3, -24, -7.3);
    fenceRun(b, 8.4, -7.3, 24, -7.3);
    fenceRun(b, -8.4, -7.3, -8.4, 9);
    fenceRun(b, 8.4, -7.3, 8.4, 9);
    tree(b, -11, -3, 1.1); tree(b, -14, 2, 1.25); tree(b, 11.5, -2.5, 1.15); tree(b, 13.5, 3.5, 1.2); tree(b, -10.5, 6.5, 1); tree(b, 10.4, 7, 1);
    bush(b, -9.6, -5.8, 1, palette.flower[0]); bush(b, 9.7, -5.6, 1, palette.flower[1]); bush(b, -12.5, -5.8, 0.9, palette.flower[2]); bush(b, 12.6, -6, 0.9);
    // Behind the lot
    for (let x = -7; x <= 7; x += 3.5) tree(b, x + (x % 2), 11 + (x > 0 ? 0.6 : 0), 1.3);
    // Lamps along the sidewalk
    for (const x of [-12, 12, -24, 24]) lamp(b, x, SIDEWALK.z0 + 0.5);
    // Across the road: three empty lots with fences.
    for (const cx of [-15, 0, 15]) {
      const x0 = cx - 6.6, x1 = cx + 6.6, z0 = FAR_WALK.z0 - 0.3, z1 = FAR_WALK.z0 - 11;
      fenceRun(b, x0, z0, x0 + 4.6, z0);
      fenceRun(b, x1 - 4.6, z0, x1, z0);
      fenceRun(b, x0, z0, x0, z1);
      fenceRun(b, x1, z0, x1, z1);
      flatB.add(new THREE.BoxGeometry(13.2, 0.03, 10.7), cx === 0 ? palette.lotDirt : palette.grassDark, [cx, 0.01, (z0 + z1) / 2]);
      for (let i = 0; i < 5; i++) flatB.add(sphere(0.25, 6, 5), palette.lotDirtDark, [cx - 4 + i * 2.1, 0.05, z0 - 3 - (i % 2) * 3], [0, 0, 0], [1.6, 0.25, 1.2]);
      tree(b, cx + 5, z1 + 1.5, 1.1);
    }
    for (const x of [-26, 26]) tree(b, x, -24, 1.4);
    const env = b.mesh(0.03);
    g.add(env, flatB.mesh(0));

    // FOR SALE sign across the road (sways).
    this.forSale = new THREE.Group();
    const fb = new MeshBuilder();
    fb.add(cylinder(0.07, 0.07, 1.6, 8), palette.cartWood, [-0.7, 0.8, 0]);
    fb.add(cylinder(0.07, 0.07, 1.6, 8), palette.cartWood, [0.7, 0.8, 0]);
    this.forSale.add(fb.mesh(0.025));
    const board = new THREE.Mesh(roundedBox(1.9, 0.9, 0.08, 0.05), toon('#ffffff'));
    board.add(new THREE.Mesh(board.geometry, outline(0.03)));
    board.position.set(0, 1.35, 0);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.75), new THREE.MeshBasicMaterial({ map: signTexture('FOR SALE', { bg: palette.forSale, fg: '#ffffff', w: 512, h: 220, font: 110 }) }));
    txt.position.z = 0.05;
    board.add(txt);
    this.forSale.add(board);
    this.forSale.position.set(0, 0, FAR_WALK.z0 - 2.4);
    this.forSale.userData.board = board;
    g.add(this.forSale);

    // Ghost outline of the future shop around the cart.
    this.ghost = new THREE.Group();
    const dash = new MeshBuilder();
    const { minX, maxX, minZ, maxZ } = SHOP_BOX;
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / 0.8);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.25) / n;
        dash.add(new THREE.BoxGeometry(x1 !== x0 ? 0.45 : 0.14, 0.03, x1 !== x0 ? 0.14 : 0.45), palette.ghostOutline, [x0 + (x1 - x0) * t, 0.03, z0 + (z1 - z0) * t]);
      }
    };
    seg(minX, minZ, maxX, minZ); seg(minX, maxZ, maxX, maxZ); seg(minX, minZ, minX, maxZ); seg(maxX, minZ, maxX, maxZ);
    const ghostMesh = new THREE.Mesh(dash.build(), flat('#ffffff', { transparent: true, opacity: 0.85 }));
    this.ghost.add(ghostMesh);
    const fill = plane(maxX - minX, maxZ - minZ, flat('#ffffff', { transparent: true, opacity: 0.08, depthWrite: false }), (minX + maxX) / 2, 0.02, (minZ + maxZ) / 2);
    this.ghost.add(fill);
    this.ghost.visible = false;
    g.add(this.ghost);

    // Cart bench along the queue (Bench upgrade).
    this.bench = new THREE.Group();
    const bb = new MeshBuilder();
    bb.add(roundedBox(3.3, 0.12, 0.55, 0.05), palette.cartWood, [0, 0.42, 0]);
    bb.add(roundedBox(3.3, 0.4, 0.1, 0.05), palette.cartWood, [0, 0.72, -0.3]);
    for (const x of [-1.4, 0, 1.4]) bb.add(roundedBox(0.12, 0.42, 0.45, 0.03), palette.cartWheel, [x, 0.2, 0]);
    this.bench.add(bb.mesh(0.028));
    // Under cart queue spots 1..3, long axis along the line, facing the counter side.
    this.bench.position.set(-1.9, 0, -4.45);
    this.bench.rotation.y = -0.357;
    this.bench.visible = false;
    g.add(this.bench);

    this.shop = this.buildShop();
    g.add(this.shop.group);
    this.shop.group.visible = false;

    // Pedestrians (view-only ambient life).
    for (let i = 0; i < 7; i++) {
      const lane = i % 3;
      this.peds.push({ look: lookFromSeed(1000 + i * 17), x: -30 + i * 9, z: lane === 0 ? -9.9 : lane === 1 ? -17.6 : -18.6, dir: i % 2 ? 1 : -1, speed: 1.3 + (i % 3) * 0.3, phase: i, lane });
    }
  }

  private buildShop(): World['shop'] {
    const group = new THREE.Group();
    const { minX, maxX, minZ, maxZ } = SHOP_BOX;
    // Floor tiles (instanced, for the ripple).
    const tileData: { x: number; z: number; delay: number }[] = [];
    for (let x = minX + 0.5; x < maxX; x += 1) for (let z = minZ + 0.5; z < maxZ; z += 1) tileData.push({ x, z, delay: Math.hypot(x, z + 1.5) * 0.06 });
    const tileGeo = new THREE.BoxGeometry(0.98, 0.06, 0.98);
    const tiles = new THREE.InstancedMesh(tileGeo, toon('#ffffff'), tileData.length);
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tileData.length * 3), 3);
    const ca = new THREE.Color(palette.shopFloorA), cb = new THREE.Color(palette.shopFloorB);
    tileData.forEach((t, i) => tiles.setColorAt(i, (Math.floor(t.x - minX) + Math.floor(t.z - minZ)) % 2 ? ca : cb));
    tiles.frustumCulled = false;
    group.add(tiles);

    // Walls: front (street side, tall, door gap), left, right (medium), back (low, cutaway).
    const walls: THREE.Object3D[] = [];
    const wallMesh = (build: (b: MeshBuilder) => void) => {
      const wb = new MeshBuilder();
      build(wb);
      const m = wb.mesh(0.035);
      const pivot = new THREE.Group();
      pivot.add(m);
      group.add(pivot);
      walls.push(pivot);
      return pivot;
    };
    const W = palette.shopWall, T = palette.shopWallTrim;
    const H = 2.7;
    wallMesh((b) => {
      const doorHalf = 1.1;
      const lw = (0 - doorHalf) - minX;
      b.add(roundedBox(lw, H, 0.3, 0.06), W, [minX + lw / 2, H / 2, minZ]);
      b.add(roundedBox(lw, H, 0.3, 0.06), W, [maxX - lw / 2, H / 2, minZ]);
      b.add(roundedBox(maxX - minX, 0.5, 0.34, 0.06), W, [0, H + 0.25, minZ]);
      b.add(roundedBox(maxX - minX + 0.1, 0.18, 0.4, 0.06), T, [0, 0.09, minZ]);
      // windows
      for (const x of [-4.3, -2.4, 2.4, 4.3]) {
        b.add(roundedBox(1.4, 1.1, 0.34, 0.08), T, [x, 1.5, minZ]);
        b.add(roundedBox(1.2, 0.9, 0.36, 0.06), '#bfe6ff', [x, 1.5, minZ]);
      }
      b.add(roundedBox(0.2, H, 0.36, 0.05), T, [-doorHalf, H / 2, minZ]);
      b.add(roundedBox(0.2, H, 0.36, 0.05), T, [doorHalf, H / 2, minZ]);
    });
    wallMesh((b) => {
      b.add(roundedBox(0.3, 1.5, maxZ - minZ, 0.06), W, [minX, 0.75, (minZ + maxZ) / 2]);
      b.add(roundedBox(0.36, 0.16, maxZ - minZ, 0.05), T, [minX, 1.5, (minZ + maxZ) / 2]);
    });
    wallMesh((b) => {
      b.add(roundedBox(0.3, 1.5, maxZ - minZ, 0.06), W, [maxX, 0.75, (minZ + maxZ) / 2]);
      b.add(roundedBox(0.36, 0.16, maxZ - minZ, 0.05), T, [maxX, 1.5, (minZ + maxZ) / 2]);
    });
    wallMesh((b) => {
      b.add(roundedBox(maxX - minX, 0.6, 0.3, 0.06), W, [0, 0.3, maxZ]);
      b.add(roundedBox(maxX - minX, 0.12, 0.36, 0.05), T, [0, 0.6, maxZ]);
    });

    // Roof: a scalloped striped awning over the front + roof trim (cutaway so we can see in).
    const roof = new THREE.Group();
    const rb = new MeshBuilder();
    for (let i = 0; i < 14; i++) {
      const x = minX + 0.5 + i;
      rb.add(roundedBox(1.0, 0.1, 1.3, 0.04), i % 2 ? palette.shopRoof : palette.shopRoofB, [x, H + 0.72, minZ - 0.5], [0.45, 0, 0]);
      rb.add(sphere(0.5, 10, 6), i % 2 ? palette.shopRoof : palette.shopRoofB, [x, H + 0.43, minZ - 1.05], [0, 0, 0], [1, 0.35, 0.3]);
    }
    rb.add(roundedBox(maxX - minX + 0.6, 0.3, 0.5, 0.08), palette.shopRoof, [0, H + 0.95, minZ + 0.05]);
    roof.add(rb.mesh(0.035));
    group.add(roof);

    // Sign: "Tiny Boba Shop" swings into place.
    const sign = new THREE.Group();
    const board = new THREE.Mesh(roundedBox(5.2, 1.1, 0.14, 0.1), toon(palette.shopSign));
    board.add(new THREE.Mesh(board.geometry, outline(0.04)));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 0.95), new THREE.MeshBasicMaterial({ map: signTexture('Tiny Boba Shop', { bg: palette.shopSign, fg: palette.ink, w: 1024, h: 200, font: 120 }) }));
    label.position.z = 0.08;
    board.add(label);
    board.position.y = -0.6;
    sign.add(board);
    sign.position.set(0, H + 1.9, minZ + 0.1);
    group.add(sign);

    // Interior: queue rope, sip tables and seats.
    const interior: THREE.Object3D[] = [];
    const rope = new MeshBuilder();
    const qs = [[0, -3.25], [-1.0, -3.45], [-2.0, -3.65], [-3.0, -3.85], [-4.0, -4.05], [-5.0, -4.3]];
    for (let i = 0; i < qs.length; i++) {
      const [x, z] = qs[i];
      rope.add(cylinder(0.06, 0.08, 0.9, 8), palette.queuePost, [x + 0.2, 0.45, z + 0.65]);
      rope.add(sphere(0.1, 8, 6), palette.queuePost, [x + 0.2, 0.95, z + 0.65]);
      if (i < qs.length - 1) {
        const [x2, z2] = qs[i + 1];
        const len = Math.hypot(x2 - x, z2 - z);
        rope.add(capsule(0.04, len, 3, 6), palette.queueRope, [(x + x2) / 2 + 0.2, 0.82, (z + z2) / 2 + 0.65], [0, -Math.atan2(z2 - z, x2 - x), Math.PI / 2]);
      }
    }
    const ropeMesh = rope.mesh(0.022);
    group.add(ropeMesh);
    interior.push(ropeMesh);
    const furn = new MeshBuilder();
    for (const [x, z] of [[2.9, -4.25], [4.1, -4.25], [2.9, -5.95], [4.1, -5.95]]) {
      furn.add(cylinder(0.45, 0.45, 0.08, 16), palette.table, [x, 0.78, z]);
      furn.add(cylinder(0.07, 0.1, 0.75, 8), palette.cartWheel, [x, 0.38, z]);
    }
    for (const [x, z] of [[2.3, -4.25], [3.5, -4.25], [4.7, -4.25], [2.3, -5.95], [3.5, -5.95], [4.7, -5.95]]) {
      furn.add(cylinder(0.24, 0.24, 0.1, 12), palette.seat, [x, 0.42, z + 0.05]);
      furn.add(cylinder(0.05, 0.05, 0.4, 6), palette.cartWheel, [x, 0.2, z + 0.05]);
    }
    // plants
    bush(furn, -6.3, -6.6, 0.8, palette.flower[0]);
    bush(furn, 6.3, -6.6, 0.8, palette.flower[1]);
    bush(furn, 6.3, 5.6, 0.7);
    bush(furn, -6.3, 5.6, 0.7, palette.flower[2]);
    const furnMesh = furn.mesh(0.028);
    group.add(furnMesh);
    interior.push(furnMesh);
    // Seating upgrade: a bench along the queue rope.
    const seating = new THREE.Group();
    const sb = new MeshBuilder();
    sb.add(roundedBox(4.4, 0.12, 0.5, 0.05), palette.seat, [0, 0.42, 0]);
    for (const x of [-1.9, 0, 1.9]) sb.add(roundedBox(0.12, 0.42, 0.4, 0.03), palette.cartWheel, [x, 0.2, 0]);
    seating.add(sb.mesh(0.028));
    seating.position.set(-3.5, 0, -4.5);
    seating.rotation.y = 0.2;
    seating.visible = false;
    group.add(seating);
    return { group, tiles, tileData, walls, roof, sign, interior, seating };
  }

  /** Apply shop reveal progress (0..1 per part) to the meshes. */
  applyShop(): void {
    const s = this.shop, p = this.shopProgress;
    s.group.visible = this.shopBuilt || p.tiles > 0;
    if (!s.group.visible) return;
    s.tileData.forEach((t, i) => {
      const k = Math.max(0, Math.min(1, (p.tiles * 1.6 - t.delay) / 0.35));
      const e = ease.outBack(k);
      this.tileM.makeTranslation(t.x, -0.04 + e * 0.05, t.z);
      this.tileM.scale(new THREE.Vector3(Math.max(0.001, e), 1, Math.max(0.001, e)));
      s.tiles.setMatrixAt(i, this.tileM);
    });
    s.tiles.instanceMatrix.needsUpdate = true;
    s.walls.forEach((w, i) => {
      const k = ease.outBack(Math.max(0, Math.min(1, p.walls[i])));
      w.scale.set(1, Math.max(0.001, k), 1);
      w.visible = p.walls[i] > 0;
    });
    const r = p.roof;
    s.roof.visible = r > 0;
    s.roof.position.y = (1 - ease.outBack(Math.min(1, r))) * 6;
    s.sign.visible = p.sign > 0;
    s.sign.rotation.x = Math.sin((1 - p.sign) * 3.2) * (1 - p.sign) * 1.4 + (p.sign >= 1 ? Math.sin(this.t * 1.7) * 0.02 : 0);
    for (const o of s.interior) {
      o.visible = p.interior > 0;
      o.scale.setScalar(Math.max(0.001, ease.outBack(Math.min(1, p.interior))));
    }
  }

  setShopBuilt(built: boolean): void {
    this.shopBuilt = built;
    const p = this.shopProgress;
    const v = built ? 1 : 0;
    p.tiles = v; p.walls = [v, v, v, v]; p.roof = v; p.sign = v; p.interior = v;
    this.applyShop();
  }

  wiggleForSale(): void { this.forSaleWiggle = 1; }

  update(dt: number, drawPeds: boolean): void {
    this.t += dt;
    const board = this.forSale.userData.board as THREE.Object3D;
    this.forSaleWiggle = Math.max(0, this.forSaleWiggle - dt * 1.5);
    board.rotation.z = Math.sin(this.t * 1.3) * 0.04 + Math.sin(this.t * 18) * 0.25 * this.forSaleWiggle;
    if (this.ghost.visible) {
      const m = (this.ghost.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + 0.3 * Math.sin(this.t * 3);
    }
    if (drawPeds) {
      for (const p of this.peds) {
        p.x += p.dir * p.speed * dt;
        if (p.x > 34) p.x = -34;
        if (p.x < -34) p.x = 34;
        p.phase += p.speed * dt * 1.6 * Math.PI;
        const hop = Math.abs(Math.sin(p.phase)) * 0.06;
        this.chars.draw({
          x: p.x, y: hop, z: p.z, facing: p.dir > 0 ? Math.PI / 2 : -Math.PI / 2, squash: 0, roll: 0, pitch: 0.05,
          face: FACE.happy, seated: false, footL: Math.max(0, Math.sin(p.phase)) * 0.05, footR: Math.max(0, -Math.sin(p.phase)) * 0.05, armSwing: Math.sin(p.phase) * 0.5,
        }, p.look);
      }
    }
  }
}

export { torus };
