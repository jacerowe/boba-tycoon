import * as THREE from 'three';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffd9b8');
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: '#f6e3c6' }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function frame() {
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
document.getElementById('splash')?.remove();
console.info(`Boba Tycoon build ${__BUILD_HASH__}`);
