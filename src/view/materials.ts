// Shared materials: soft toon shading with a warm rim light, and inverted-hull outlines.
// Materials are cached so geometry/material pairs are shared (fewer programs, fewer uploads).
import * as THREE from 'three';
import { palette } from '../config/style';

let gradient: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  // Three soft tones: shadows stay warm and light so colors read bold.
  const data = new Uint8Array([168, 168, 168, 255, 218, 218, 218, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Shared uniforms (e.g. rush saturation boost) injected into every toon material. */
export const globalUniforms = {
  uRim: { value: 0.22 },
  uSat: { value: 1.0 },
  uTime: { value: 0 },
};

function addRim(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = globalUniforms.uRim;
    shader.uniforms.uSat = globalUniforms.uSat;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform float uSat;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
          outgoingLight += vec3(1.0, 0.93, 0.85) * fres * uRim;
          float l = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
          outgoingLight = mix(vec3(l), outgoingLight, uSat);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'toonRim';
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: { vertexColors?: boolean; transparent?: boolean; opacity?: number; emissive?: THREE.ColorRepresentation; side?: THREE.Side } = {}): THREE.MeshToonMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.vertexColors ? 1 : 0}|${opts.transparent ? opts.opacity : 1}|${opts.emissive ?? ''}|${opts.side ?? 0}`;
  const hit = toonCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({
    color: opts.vertexColors ? 0xffffff : color,
    gradientMap: gradientMap(),
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
  addRim(m);
  toonCache.set(key, m);
  return m;
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();

/** Inverted hull outline: back faces pushed out along the normal. Works with InstancedMesh. */
export function outline(thickness = 0.03, color: THREE.ColorRepresentation = palette.outline): THREE.MeshBasicMaterial {
  const key = `${thickness}|${new THREE.Color(color).getHexString()}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * uOutline;');
  };
  m.customProgramCacheKey = () => 'outline' + thickness;
  outlineCache.set(key, m);
  return m;
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();
export function flat(color: THREE.ColorRepresentation, opts: { transparent?: boolean; opacity?: number; depthWrite?: boolean; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${opts.depthWrite ?? true}|${opts.side ?? 0}`;
  const hit = basicCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? true, side: opts.side ?? THREE.FrontSide });
  basicCache.set(key, m);
  return m;
}

/** Soft blob shadow texture (radial gradient), drawn procedurally. */
let blobTex: THREE.Texture | null = null;
export function blobShadowTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grd.addColorStop(0, 'rgba(74,37,69,0.55)');
  grd.addColorStop(0.6, 'rgba(74,37,69,0.3)');
  grd.addColorStop(1, 'rgba(74,37,69,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

let shadowMat: THREE.MeshBasicMaterial | null = null;
export function blobShadowMaterial(): THREE.MeshBasicMaterial {
  if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
  return shadowMat;
}
