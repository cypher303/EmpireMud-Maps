import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DISPLACEMENT_SCALE, NORMAL_SCALE } from './config';

interface GlobeOptions {
  texture: THREE.Texture;
  heightMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  container: HTMLElement;
  segments?: number;
}

export interface GlobeHandle {
  dispose: () => void;
  setDisplacementScale: (scale: number) => void;
  getDisplacementScale: () => number;
  sweepToHorizon: () => void;
}

const GLOBE_RADIUS = 2.4;
const GLOBE_SEGMENTS = 256;
const GLOBE_ROTATION_SPEED = 0.0015; // radians per second (gentle spin)
// const GLOBE_ROTATION_SPEED = 0.01; // radians per second (gentle spin)

const MOON_ORBIT_RADIUS = 24;
const MOON_ORBIT_SPEED = 0.015; // slow but noticeably quicker than the sun
const MOON_ORBIT_TILT = THREE.MathUtils.degToRad(5.1); // moon plane relative to ecliptic
const MOON_RADIUS = 0.65;
const MOON_ROTATION_SPEED = 0.0008; // slight self-spin to keep the surface moving

const MATCHED_APPARENT_RADIUS = MOON_RADIUS / MOON_ORBIT_RADIUS;

const SUN_ORBIT_RADIUS = 160;
const SUN_ORBIT_SPEED = 0.005; // radians per second (barely moves)
const SUN_ORBIT_TILT = 0;
const SUN_RADIUS = MATCHED_APPARENT_RADIUS * SUN_ORBIT_RADIUS;

const CAMERA_FAR = SUN_ORBIT_RADIUS * 2;
const INITIAL_CAMERA_DISTANCE = Math.min(MOON_ORBIT_RADIUS * 0.55, SUN_ORBIT_RADIUS * 0.2);

const HORIZON_POLAR_ANGLE = THREE.MathUtils.degToRad(84); // tilt toward horizon for a grazing view
const HORIZON_DISTANCE_FALLBACK = GLOBE_RADIUS * 1.5;
const HORIZON_APPROACH_MARGIN = GLOBE_RADIUS * 0.1;
const AUTO_HORIZON_TRIGGER_DISTANCE = HORIZON_DISTANCE_FALLBACK - GLOBE_RADIUS * 0.05;
const AUTO_HORIZON_RESET_DISTANCE = AUTO_HORIZON_TRIGGER_DISTANCE + GLOBE_RADIUS * 0.6;
const MIN_CAMERA_MARGIN = GLOBE_RADIUS * 0.05;
const HORIZON_SWEEP_DURATION = 2.1;

const clampAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const smoothStep = (t: number) => t * t * (3 - 2 * t);

function createSunTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create context for sun texture');
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 244, 214, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 214, 102, 0.95)');
  gradient.addColorStop(1, 'rgba(255, 170, 51, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function createMoonTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create context for moon sprite');
  }

  // Base fill to avoid dark seams at UV edges
  context.fillStyle = '#d8dde7';
  context.fillRect(0, 0, size, size);

  // Disk
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
  context.fill();

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
    craterGradient.addColorStop(0, 'rgba(80, 90, 110, 0.3)');
    craterGradient.addColorStop(0.6, 'rgba(60, 70, 90, 0.2)');
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

  context.fillStyle = 'rgba(80, 90, 110, 0.15)';
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

export function bootstrapGlobe({ texture, heightMap, normalMap, container, segments }: GlobeOptions): GlobeHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04070f');

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, CAMERA_FAR);
  camera.position.set(0, 0, INITIAL_CAMERA_DISTANCE);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const appliedSegments = Math.max(8, Math.floor(segments ?? GLOBE_SEGMENTS));
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, appliedSegments, appliedSegments);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    metalness: 0,
    displacementMap: heightMap ?? null,
    displacementScale: heightMap ? DISPLACEMENT_SCALE : 0,
    normalMap: normalMap ?? null,
    normalScale: normalMap ? new THREE.Vector2(NORMAL_SCALE, NORMAL_SCALE) : undefined,
  });
  let displacementScale = heightMap ? DISPLACEMENT_SCALE : 0;
  const globe = new THREE.Mesh(geometry, material);
  globe.castShadow = true;
  globe.receiveShadow = true;
  scene.add(globe);

  const ambientLight = new THREE.AmbientLight('#0d1626', 0.6);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight('#4b6ea9', '#0b101a', 0.35);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#ffd8a8', 1.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  const sunShadowCamera = sunLight.shadow.camera as THREE.OrthographicCamera;
  const shadowRange = Math.max(GLOBE_RADIUS * 3, MOON_ORBIT_RADIUS * 1.2);
  sunShadowCamera.left = -shadowRange;
  sunShadowCamera.right = shadowRange;
  sunShadowCamera.top = shadowRange;
  sunShadowCamera.bottom = -shadowRange;
  sunShadowCamera.near = Math.max(1, SUN_ORBIT_RADIUS - MOON_ORBIT_RADIUS * 2);
  sunShadowCamera.far = SUN_ORBIT_RADIUS + MOON_ORBIT_RADIUS * 2;
  sunShadowCamera.updateProjectionMatrix();
  scene.add(sunLight);
  scene.add(sunLight.target);

  const sunTexture = createSunTexture();
  const sunMaterial = new THREE.MeshStandardMaterial({
    map: sunTexture,
    emissive: '#f7d18a',
    emissiveIntensity: 2.2,
    roughness: 0.7,
    metalness: 0,
  });
  const sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, 48, 48);
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  scene.add(sunMesh);

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
  moonMesh.castShadow = true;
  moonMesh.receiveShadow = true;
  scene.add(moonMesh);

  const moonToSun = new THREE.Vector3();
  const moonToEarth = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const earthDir = new THREE.Vector3();

  const computeMoonEclipseFactor = () => {
    moonToSun.subVectors(sunMesh.position, moonMesh.position);
    moonToEarth.copy(moonMesh.position).multiplyScalar(-1); // earth at origin

    const sunDistance = moonToSun.length();
    const earthDistance = moonToEarth.length();
    if (sunDistance === 0 || earthDistance === 0) {
      return 1;
    }

    sunDir.copy(moonToSun).normalize();
    earthDir.copy(moonToEarth).normalize();
    const alignment = THREE.MathUtils.clamp(sunDir.dot(earthDir), -1, 1);

    if (alignment <= 0 || earthDistance >= sunDistance) {
      return 1; // earth not between moon and sun
    }

    const angleBetween = Math.acos(alignment);
    const earthAngularRadius = Math.atan2(GLOBE_RADIUS, earthDistance);
    const sunAngularRadius = Math.atan2(SUN_RADIUS, sunDistance);

    const penumbraLimit = earthAngularRadius + sunAngularRadius;
    const umbraLimit = Math.max(earthAngularRadius - sunAngularRadius, 0);

    if (angleBetween <= umbraLimit) {
      return 0;
    }
    if (angleBetween >= penumbraLimit) {
      return 1;
    }

    const t = (angleBetween - umbraLimit) / (penumbraLimit - umbraLimit);
    return THREE.MathUtils.clamp(t, 0, 1);
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxDistance = SUN_ORBIT_RADIUS * 1.1;
  controls.minDistance = GLOBE_RADIUS * 1.2;

  const handleResize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };

  handleResize();
  window.addEventListener('resize', handleResize);

  const spherical = new THREE.Spherical();
  const lerpTarget = new THREE.Vector3();

  type CameraAnimation = {
    fromRadius: number;
    toRadius: number;
    fromPhi: number;
    toPhi: number;
    fromTheta: number;
    toTheta: number;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    duration: number;
    elapsed: number;
  };

  let cameraAnimation: CameraAnimation | null = null;
  let hasSweptToHorizon = false;

  const getCameraState = () => {
    spherical.setFromVector3(camera.position);
    return {
      radius: spherical.radius,
      phi: spherical.phi,
      theta: spherical.theta,
      target: controls.target.clone(),
    };
  };

  const startCameraAnimation = ({
    radius,
    phi,
    theta,
    target,
    duration,
  }: {
    radius?: number;
    phi?: number;
    theta?: number;
    target?: THREE.Vector3;
    duration: number;
  }) => {
    const state = getCameraState();
    const nextRadius = THREE.MathUtils.clamp(radius ?? state.radius, controls.minDistance, controls.maxDistance);
    const nextPhi = THREE.MathUtils.clamp(phi ?? state.phi, 0.0001, Math.PI - 0.0001);
    const nextTheta = theta ?? state.theta;
    cameraAnimation = {
      fromRadius: state.radius,
      toRadius: nextRadius,
      fromPhi: state.phi,
      toPhi: nextPhi,
      fromTheta: state.theta,
      toTheta: nextTheta,
      fromTarget: state.target,
      toTarget: target ? target.clone() : state.target,
      duration,
      elapsed: 0,
    };
    controls.enabled = false;
  };

  const updateCameraAnimation = (delta: number) => {
    if (!cameraAnimation) {
      return;
    }
    cameraAnimation.elapsed = Math.min(cameraAnimation.elapsed + delta, cameraAnimation.duration);
    const t = smoothStep(cameraAnimation.elapsed / cameraAnimation.duration);

    const radius = THREE.MathUtils.lerp(cameraAnimation.fromRadius, cameraAnimation.toRadius, t);
    const phi = THREE.MathUtils.lerp(cameraAnimation.fromPhi, cameraAnimation.toPhi, t);
    const theta = cameraAnimation.fromTheta + clampAngle(cameraAnimation.toTheta - cameraAnimation.fromTheta) * t;
    lerpTarget.copy(cameraAnimation.fromTarget).lerp(cameraAnimation.toTarget, t);

    spherical.set(radius, phi, theta);
    camera.position.setFromSpherical(spherical);
    camera.lookAt(lerpTarget);
    controls.target.copy(lerpTarget);

    if (cameraAnimation.elapsed >= cameraAnimation.duration) {
      cameraAnimation = null;
      controls.enabled = true;
      controls.update();
    }
  };

  const sweepToHorizon = (preferCurrentDistance = false) => {
    const state = getCameraState();
    const minRadius = controls.minDistance + MIN_CAMERA_MARGIN;
    const targetRadius = preferCurrentDistance
      ? Math.max(state.radius, minRadius)
      : THREE.MathUtils.clamp(HORIZON_DISTANCE_FALLBACK, minRadius, controls.maxDistance);
    startCameraAnimation({
      radius: targetRadius,
      phi: HORIZON_POLAR_ANGLE,
      duration: HORIZON_SWEEP_DURATION,
    });
    hasSweptToHorizon = true;
  };

  const onControlsChange = () => {
    if (cameraAnimation) {
      return;
    }
    const distance = camera.position.distanceTo(controls.target);
    if (!hasSweptToHorizon && distance <= AUTO_HORIZON_TRIGGER_DISTANCE) {
      sweepToHorizon(true);
      return;
    }
    if (hasSweptToHorizon && distance > AUTO_HORIZON_RESET_DISTANCE) {
      hasSweptToHorizon = false;
    }
  };
  controls.addEventListener('change', onControlsChange);

  let animationFrame = 0;
  const clock = new THREE.Clock();
  let sunAngle = Math.PI / 3;
  let moonAngle = Math.PI;

  const updateSun = (delta: number) => {
    sunAngle += delta * SUN_ORBIT_SPEED;

    const x = Math.cos(sunAngle) * SUN_ORBIT_RADIUS;
    const sinAngle = Math.sin(sunAngle);
    const y = sinAngle * SUN_ORBIT_RADIUS * Math.sin(SUN_ORBIT_TILT);
    const z = sinAngle * SUN_ORBIT_RADIUS * Math.cos(SUN_ORBIT_TILT);

    sunMesh.position.set(x, y, z);
    sunLight.position.copy(sunMesh.position);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();
  };

  const updateMoon = (delta: number) => {
    moonAngle += delta * MOON_ORBIT_SPEED;

    const x = Math.cos(moonAngle) * MOON_ORBIT_RADIUS;
    const sinAngle = Math.sin(moonAngle);
    const y = sinAngle * MOON_ORBIT_RADIUS * Math.sin(MOON_ORBIT_TILT);
    const z = sinAngle * MOON_ORBIT_RADIUS * Math.cos(MOON_ORBIT_TILT);

    moonMesh.position.set(x, y, z);
    moonMesh.rotation.y += delta * MOON_ROTATION_SPEED;
    moonLight.position.copy(moonMesh.position);

    const eclipseFactor = computeMoonEclipseFactor();
    moonLight.intensity = 0.35 * eclipseFactor;
    const moonBrightness = THREE.MathUtils.lerp(0.25, 1, eclipseFactor);
    moonMaterial.color.setScalar(moonBrightness);
  };

  const animate = () => {
    const delta = clock.getDelta();
    updateSun(delta);
    updateMoon(delta);
    updateCameraAnimation(delta);
    globe.rotation.y -= delta * GLOBE_ROTATION_SPEED; // opposite direction
    controls.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  const dispose = () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', handleResize);
    controls.removeEventListener('change', onControlsChange);
    controls.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
    heightMap?.dispose();
    sunMaterial.map?.dispose();
    sunMaterial.dispose();
    sunGeometry.dispose();
    moonMaterial.map?.dispose();
    moonMaterial.dispose();
    moonGeometry.dispose();
    scene.remove(sunMesh);
    scene.remove(moonMesh);
    scene.remove(sunLight);
    scene.remove(sunLight.target);
    scene.remove(moonLight);
    scene.remove(hemiLight);
    scene.remove(ambientLight);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };

  return {
    dispose,
    setDisplacementScale: (scale: number) => {
      displacementScale = scale;
      material.displacementScale = scale;
      material.needsUpdate = true;
    },
    getDisplacementScale: () => displacementScale,
    sweepToHorizon,
  };
}
