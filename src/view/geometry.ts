// Procedural geometry helpers: rounded boxes, capsules, lathe cups, and a merge builder
// that bakes many colored parts into one vertex-colored mesh (+ one outline) per prop.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, outline } from './materials';

/**
 * Publish this frame's instances: upload only the live ones (buffers are sized for the worst
 * case) and hide the mesh when it has none, so three.js skips its program and uniform setup.
 */
export function commitInstances(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count === 0) return;
  const m = mesh.instanceMatrix;
  m.clearUpdateRanges();
  m.addUpdateRange(0, count * 16);
  m.needsUpdate = true;
  const c = mesh.instanceColor;
  if (c) {
    c.clearUpdateRanges();
    c.addUpdateRange(0, count * 3);
    c.needsUpdate = true;
  }
}

export function roundedBox(w: number, h: number, d: number, r = 0.06, seg = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
}

export function capsule(radius: number, length: number, capSeg = 6, radial = 12): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(radius, length, capSeg, radial);
}

export function sphere(r: number, w = 16, h = 12): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, w, h);
}

export function cylinder(rTop: number, rBottom: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
}

export function torus(r: number, tube: number, radial = 8, tubular = 20): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, radial, tubular);
}

/** Cup profile: slightly tapered with a rounded bottom. Height 1, top radius 1 (scale it). */
export function cupProfile(bottomR: number, topR: number, h: number, round = 0.06, steps = 8): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(bottomR - round + Math.sin(a) * round, round - Math.cos(a) * round));
  }
  pts.push(new THREE.Vector2(topR, h));
  return pts;
}

export function lathe(points: THREE.Vector2[], seg = 20): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points, seg);
}

/** Keep only position + normal so different primitives can merge. */
function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  }
  return out;
}

/** Bake many colored parts into one geometry with a color attribute. */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] | number = 1): this {
    const g = strip(geo);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale),
    );
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }

  get empty(): boolean { return this.parts.length === 0; }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    return g;
  }

  /** A mesh with toon vertex colors and (optionally) an outline child. */
  mesh(outlineThickness = 0.03): THREE.Mesh {
    const geo = this.build();
    const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
    if (outlineThickness > 0) {
      const o = new THREE.Mesh(geo, outline(outlineThickness));
      o.name = 'outline';
      m.add(o);
    }
    return m;
  }
}

/** A single-material mesh with an outline child. */
export function outlined(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, thickness = 0.03): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  if (thickness > 0) {
    const o = new THREE.Mesh(geo, outline(thickness));
    o.name = 'outline';
    m.add(o);
  }
  return m;
}
