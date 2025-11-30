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
const MOON_RADIUS = 0.25;

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

function createMoonTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create context for moon sprite');
  }

  // Base disk (solid)
  context.fillStyle = '#d8dde7';
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
  context.fill();

  // Soft shading
  const shade = context.createRadialGradient(size * 0.35, size * 0.35, size * 0.05, size * 0.5, size * 0.5, size * 0.5);
  shade.addColorStop(0, 'rgba(40, 50, 70, 0.35)');
  shade.addColorStop(1, 'rgba(40, 50, 70, 0)');
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = shade;
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';

  // Craters (fixed positions for determinism)
  const craters = [
    { x: 0.38, y: 0.36, r: 0.07 },
    { x: 0.62, y: 0.42, r: 0.06 },
    { x: 0.45, y: 0.58, r: 0.065 },
    { x: 0.58, y: 0.64, r: 0.05 },
    { x: 0.32, y: 0.52, r: 0.045 },
    { x: 0.48, y: 0.42, r: 0.035 },
    { x: 0.55, y: 0.31, r: 0.03 },
  ];

  craters.forEach(({ x, y, r }) => {
    const cx = x * size;
    const cy = y * size;
    const radius = r * size;

    const craterGradient = context.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    craterGradient.addColorStop(0, 'rgba(80, 90, 110, 0.45)');
    craterGradient.addColorStop(0.6, 'rgba(60, 70, 90, 0.3)');
    craterGradient.addColorStop(1, 'rgba(20, 25, 35, 0)');

    context.fillStyle = craterGradient;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
  });

  // Fine speckle field (smaller, subtle pits)
  const speckles = [
    { x: 0.28, y: 0.34, r: 0.015 },
    { x: 0.36, y: 0.44, r: 0.012 },
    { x: 0.42, y: 0.33, r: 0.013 },
    { x: 0.52, y: 0.55, r: 0.014 },
    { x: 0.61, y: 0.52, r: 0.012 },
    { x: 0.66, y: 0.58, r: 0.011 },
    { x: 0.47, y: 0.68, r: 0.013 },
    { x: 0.35, y: 0.63, r: 0.012 },
    { x: 0.30, y: 0.57, r: 0.011 },
    { x: 0.56, y: 0.46, r: 0.011 },
  ];

  context.fillStyle = 'rgba(80, 90, 110, 0.25)';
  speckles.forEach(({ x, y, r }) => {
    const cx = x * size;
    const cy = y * size;
    const radius = r * size;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
  });

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
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
  const moonTexture = createMoonTexture();
  const moonMaterial = new THREE.MeshStandardMaterial({
    map: moonTexture,
    roughness: 1,
    metalness: 0,
  });
  const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 48, 48);
  const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(moonMesh);

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

    moonMesh.position.set(x, y, z);
    moonLight.position.copy(moonMesh.position);
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
    moonMaterial.map?.dispose();
    moonMaterial.dispose();
    moonGeometry.dispose();
    scene.remove(sunSprite);
    scene.remove(moonMesh);
    scene.remove(sunLight);
    scene.remove(sunLight.target);
    scene.remove(moonLight);
    scene.remove(ambientLight);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };
}
