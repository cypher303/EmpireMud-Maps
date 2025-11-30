import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface GlobeOptions {
  texture: THREE.Texture;
  container: HTMLElement;
}

const SUN_ORBIT_RADIUS = 6.5;
const SUN_ORBIT_SPEED = 0.005; // radians per second (barely moves)
const SUN_ORBIT_TILT = 0.2;
const SUN_SCALE = 1.1;
const GLOBE_ROTATION_SPEED = 0.0015; // radians per second (gentle spin)
const MOON_ORBIT_RADIUS = 3.2;
const MOON_ORBIT_SPEED = 0.015; // slow but noticeably quicker than the sun
const MOON_ORBIT_TILT = 0.35;
const MOON_SCALE = 0.35;

function createSunSprite(): THREE.Sprite {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create context for sun sprite');
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 244, 214, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 214, 102, 0.95)');
  gradient.addColorStop(1, 'rgba(255, 170, 51, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(SUN_SCALE);
  return sprite;
}

function createMoonSprite(): THREE.Sprite {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create context for moon sprite');
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(230, 236, 245, 1)');
  gradient.addColorStop(0.5, 'rgba(190, 200, 215, 0.9)');
  gradient.addColorStop(1, 'rgba(150, 160, 175, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(MOON_SCALE);
  return sprite;
}

export function bootstrapGlobe({ texture, container }: GlobeOptions): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04070f');

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 6.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.SphereGeometry(2.4, 128, 128);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    metalness: 0,
  });
  const globe = new THREE.Mesh(geometry, material);
  scene.add(globe);

  const ambientLight = new THREE.AmbientLight('#0b1120', 0.4);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight('#ffd8a8', 2.1);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const sunSprite = createSunSprite();
  scene.add(sunSprite);

  const moonLight = new THREE.PointLight('#c8d7ff', 0.35, 50, 2);
  scene.add(moonLight);
  const moonSprite = createMoonSprite();
  scene.add(moonSprite);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxDistance = 10;
  controls.minDistance = 3;

  const handleResize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };

  handleResize();
  window.addEventListener('resize', handleResize);

  let animationFrame = 0;
  const clock = new THREE.Clock();
  let sunAngle = Math.PI / 3;
  let moonAngle = Math.PI;

  const updateSun = (delta: number) => {
    sunAngle += delta * SUN_ORBIT_SPEED;

    const x = Math.cos(sunAngle) * SUN_ORBIT_RADIUS;
    const z = Math.sin(sunAngle) * SUN_ORBIT_RADIUS;
    const y = Math.sin(sunAngle * (1 + SUN_ORBIT_TILT)) * SUN_ORBIT_RADIUS * 0.15;

    sunSprite.position.set(x, y, z);
    sunLight.position.copy(sunSprite.position);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();
  };

  const updateMoon = (delta: number) => {
    moonAngle += delta * MOON_ORBIT_SPEED;

    const x = Math.cos(moonAngle) * MOON_ORBIT_RADIUS;
    const z = Math.sin(moonAngle) * MOON_ORBIT_RADIUS;
    const y = Math.sin(moonAngle * (1 + MOON_ORBIT_TILT)) * MOON_ORBIT_RADIUS * 0.2;

    moonSprite.position.set(x, y, z);
    moonLight.position.copy(moonSprite.position);
  };

  const animate = () => {
    const delta = clock.getDelta();
    updateSun(delta);
    updateMoon(delta);
    globe.rotation.y -= delta * GLOBE_ROTATION_SPEED; // opposite direction
    controls.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  return () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', handleResize);
    controls.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
    sunSprite.material.map?.dispose();
    sunSprite.material.dispose();
    moonSprite.material.map?.dispose();
    moonSprite.material.dispose();
    scene.remove(sunSprite);
    scene.remove(moonSprite);
    scene.remove(sunLight);
    scene.remove(sunLight.target);
    scene.remove(moonLight);
    scene.remove(ambientLight);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };
}
