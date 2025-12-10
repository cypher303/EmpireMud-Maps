import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ATMOSPHERE_COLOR,
  ATMOSPHERE_OPACITY,
  ATMOSPHERE_THICKNESS_RATIO,
  CLOUD_OPACITY,
  CLOUD_ROTATION_SPEED,
  CLOUD_THICKNESS_RATIO,
  DISPLACEMENT_SCALE,
  DETAIL_NORMAL_STRENGTH,
  NORMAL_SCALE,
  MOUNTAIN_DETAIL_SLOPE_END,
  MOUNTAIN_DETAIL_SLOPE_START,
  MOUNTAIN_DETAIL_SNOW_END,
  MOUNTAIN_DETAIL_SNOW_START,
  MOUNTAIN_DETAIL_STRENGTH,
  MOUNTAIN_DETAIL_TILING,
  MOUNTAIN_ROCK_COLORS,
  MOUNTAIN_SNOW_COLORS,
  MOUNTAIN_SOIL_COLORS,
  PLANET_VIEW_DISTANCE,
  SOLAR_SYSTEM_VIEW_DISTANCE,
} from './config';

interface GlobeOptions {
  texture: THREE.Texture;
  heightMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  mountainMask?: THREE.Texture;
  detailAlbedo?: THREE.Texture | null;
  detailNormal?: THREE.Texture | null;
  container: HTMLElement;
  segments?: number;
  renderer?: THREE.WebGLRenderer;
  atmosphereEnabled?: boolean;
  cloudsEnabled?: boolean;
  onCameraDistanceChange?: (distance: number) => void;
  onCameraViewChange?: (state: CameraViewState) => void;
  onSpatialUpdate?: (state: SpatialSnapshot) => void;
  timeScale?: number;
  onCameraLockChange?: (target: CameraLockTarget | null) => void;
  prefersReducedMotion?: boolean;
}

export interface GlobeHandle {
  dispose: () => void;
  setDisplacementScale: (scale: number) => void;
  getDisplacementScale: () => number;
  sweepToHorizon: () => void;
  setAtmosphereVisible: (visible: boolean) => void;
  setCloudsVisible: (visible: boolean) => void;
  setNormalMapEnabled: (enabled: boolean) => void;
  setMoonLightEnabled: (enabled: boolean) => void;
  setLightHelpersVisible: (visible: boolean) => void;
  setTimeScale: (scale: number) => void;
  setCameraLock: (target: CameraLockTarget | null, options?: { snap?: boolean }) => void;
  getCameraLock: () => CameraLockTarget | null;
}

export interface CameraViewState {
  distance: number;
  isPlanetView: boolean;
  isSystemView: boolean;
}

export interface SpatialSnapshot {
  sunPosition: THREE.Vector3;
  moonPosition: THREE.Vector3;
  planetPosition: THREE.Vector3;
  cameraPosition: THREE.Vector3;
  cameraDirection: THREE.Vector3;
  cameraUp: THREE.Vector3;
}

export type CameraLockTarget = 'sun' | 'moon' | 'earth';

const GLOBE_RADIUS = 2.4;
const GLOBE_SEGMENTS = 256;
const GLOBE_ROTATION_SPEED = 0.0015; // radians per second (gentle spin)
// const GLOBE_ROTATION_SPEED = 0.01; // radians per second (gentle spin)
const ATMOSPHERE_SCALE = 1 + ATMOSPHERE_THICKNESS_RATIO;
const CLOUD_SCALE = 1 + CLOUD_THICKNESS_RATIO;

const MOON_ORBIT_RADIUS = 24;
const MOON_ORBIT_SPEED = 0.015; // slow but noticeably quicker than the sun
const MOON_ORBIT_TILT = THREE.MathUtils.degToRad(5.1); // moon plane relative to ecliptic
const MOON_RADIUS = 0.65;
const MOON_ROTATION_SPEED = 0.0008; // slight self-spin to keep the surface moving
const MOON_BASE_INTENSITY = 0.35;

const MATCHED_APPARENT_RADIUS = MOON_RADIUS / MOON_ORBIT_RADIUS;

const SUN_ORBIT_RADIUS = 160;
const SUN_ORBIT_SPEED = 0.005; // radians per second (barely moves)
const SUN_ORBIT_TILT = 0;
const SUN_RADIUS = MATCHED_APPARENT_RADIUS * SUN_ORBIT_RADIUS;

const CAMERA_FAR = SUN_ORBIT_RADIUS * 2.6; // keep sun in frustum when zoomed out and opposite the camera
const INITIAL_CAMERA_DISTANCE = Math.min(
  MOON_ORBIT_RADIUS * 3.5,
  SUN_ORBIT_RADIUS * 0.6
); // start in a wide system view so solar ambience dominates
const INITIAL_ORBIT_ELEVATION = 0.18;
const INITIAL_ORBIT_AZIMUTH = Math.PI / 4;

const HORIZON_POLAR_ANGLE = THREE.MathUtils.degToRad(84); // tilt toward horizon for a grazing view
const HORIZON_DISTANCE_FALLBACK = GLOBE_RADIUS * 1.5;
const HORIZON_APPROACH_MARGIN = GLOBE_RADIUS * 0.1;
const AUTO_HORIZON_TRIGGER_DISTANCE = HORIZON_DISTANCE_FALLBACK - GLOBE_RADIUS * 0.05;
const AUTO_HORIZON_RESET_DISTANCE = AUTO_HORIZON_TRIGGER_DISTANCE + GLOBE_RADIUS * 0.6;
const MIN_CAMERA_MARGIN = GLOBE_RADIUS * 0.05;
const HORIZON_SWEEP_DURATION = 2.1;
const CAMERA_HORIZON_BLEND_START_RATIO = 1.9;
const CAMERA_HORIZON_BLEND_END_RATIO = 1.05;
const CAMERA_HORIZON_LOOK_AHEAD_RATIO = 0.78;
const CAMERA_HORIZON_LOOK_LIFT_RATIO = 0.06;
const CAMERA_LOCK_DEFAULT_DURATION = 0.85;
const CAMERA_LOCK_FOLLOW_RATE = 3.6;

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

function createAtmosphereMesh(radius: number, segments: number): THREE.Mesh {
  const shellSegments = Math.max(48, Math.floor(segments * 0.8));
  const geometry = new THREE.SphereGeometry(radius * ATMOSPHERE_SCALE, shellSegments, shellSegments);
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(ATMOSPHERE_COLOR),
    emissive: new THREE.Color(ATMOSPHERE_COLOR),
    emissiveIntensity: Math.max(0.2, ATMOSPHERE_OPACITY * 2.2),
    transparent: true,
    opacity: ATMOSPHERE_OPACITY,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function createCloudAlphaTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create context for cloud texture');
  }

  context.fillStyle = 'black';
  context.fillRect(0, 0, size, size);
  const blobs = Math.round(size * 1.2);
  for (let i = 0; i < blobs; i += 1) {
    const radius = size * (0.008 + Math.random() * 0.05);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const gradient = context.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.22)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCloudMesh(
  radius: number,
  segments: number,
  renderer: THREE.WebGLRenderer
): { mesh: THREE.Mesh; texture: THREE.Texture } {
  const shellSegments = Math.max(64, Math.floor(segments));
  const texture = createCloudAlphaTexture();
  const geometry = new THREE.SphereGeometry(radius * CLOUD_SCALE, shellSegments, shellSegments);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: CLOUD_OPACITY,
    alphaMap: texture,
    map: texture,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
  });
  if (material.alphaMap) {
    material.alphaMap.wrapS = material.alphaMap.wrapT = THREE.RepeatWrapping;
    material.alphaMap.repeat.copy(texture.repeat);
  }
  const mapTexture = material.map ?? texture;
  mapTexture.wrapS = mapTexture.wrapT = THREE.RepeatWrapping;
  mapTexture.repeat.copy(texture.repeat);
  mapTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy() ?? 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'cloud-shell';
  return { mesh, texture };
}

export function bootstrapGlobe({
  texture,
  heightMap,
  normalMap,
  mountainMask,
  detailAlbedo,
  detailNormal,
  container,
  segments,
  renderer: providedRenderer,
  atmosphereEnabled = true,
  cloudsEnabled = true,
  onCameraDistanceChange,
  onCameraViewChange,
  onSpatialUpdate,
  timeScale: initialTimeScale = 1,
  onCameraLockChange,
  prefersReducedMotion = false,
}: GlobeOptions): GlobeHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04070f');

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, CAMERA_FAR);
  {
    const distance = INITIAL_CAMERA_DISTANCE;
    const horizontal = distance * Math.cos(INITIAL_ORBIT_ELEVATION);
    const y = distance * Math.sin(INITIAL_ORBIT_ELEVATION);
    const x = horizontal * Math.cos(INITIAL_ORBIT_AZIMUTH);
    const z = horizontal * Math.sin(INITIAL_ORBIT_AZIMUTH);
    camera.position.set(x, y, z);
  }

  const renderer = providedRenderer ?? new THREE.WebGLRenderer({ antialias: true });
  const ownsRenderer = !providedRenderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (!container.contains(renderer.domElement)) {
    container.appendChild(renderer.domElement);
  }
  let atmosphereMesh: THREE.Mesh | null = null;
  let cloudMesh: THREE.Mesh | null = null;
  let cloudTexture: THREE.Texture | null = null;
  let sunHelper: THREE.DirectionalLightHelper | null = null;
  let moonLightHelper: THREE.PointLightHelper | null = null;

  const appliedSegments = Math.max(8, Math.floor(segments ?? GLOBE_SEGMENTS));
  const soilColorA = new THREE.Color(MOUNTAIN_SOIL_COLORS[0]);
  const soilColorB = new THREE.Color(MOUNTAIN_SOIL_COLORS[1]);
  const rockColorA = new THREE.Color(MOUNTAIN_ROCK_COLORS[0]);
  const rockColorB = new THREE.Color(MOUNTAIN_ROCK_COLORS[1]);
  const snowColorA = new THREE.Color(MOUNTAIN_SNOW_COLORS[0]);
  const snowColorB = new THREE.Color(MOUNTAIN_SNOW_COLORS[1]);
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, appliedSegments, appliedSegments);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    metalness: 0,
    displacementMap: heightMap ?? null,
    displacementScale: heightMap ? DISPLACEMENT_SCALE : 0,
    normalMap: normalMap ?? null,
    normalScale: normalMap ? new THREE.Vector2(NORMAL_SCALE, NORMAL_SCALE) : undefined,
    normalMapType: THREE.TangentSpaceNormalMap,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mountainMaskMap = { value: mountainMask ?? null };
    shader.uniforms.useMountainMaskMap = { value: Boolean(mountainMask) };
    shader.uniforms.detailAlbedoMap = { value: detailAlbedo ?? null };
    shader.uniforms.useDetailAlbedoMap = { value: Boolean(detailAlbedo) };
    shader.uniforms.detailNormalMap = { value: detailNormal ?? null };
    shader.uniforms.useDetailNormalMap = { value: Boolean(detailNormal) };
    shader.uniforms.detailNormalStrength = { value: DETAIL_NORMAL_STRENGTH };
    shader.uniforms.mountainDetailStrength = { value: MOUNTAIN_DETAIL_STRENGTH };
    shader.uniforms.mountainDetailSlopeStart = { value: MOUNTAIN_DETAIL_SLOPE_START };
    shader.uniforms.mountainDetailSlopeEnd = { value: MOUNTAIN_DETAIL_SLOPE_END };
    shader.uniforms.mountainDetailSnowStart = { value: MOUNTAIN_DETAIL_SNOW_START };
    shader.uniforms.mountainDetailSnowEnd = { value: MOUNTAIN_DETAIL_SNOW_END };
    shader.uniforms.mountainDetailTiling = { value: MOUNTAIN_DETAIL_TILING };
    shader.uniforms.mountainSoilColorA = { value: soilColorA };
    shader.uniforms.mountainSoilColorB = { value: soilColorB };
    shader.uniforms.mountainRockColorA = { value: rockColorA };
    shader.uniforms.mountainRockColorB = { value: rockColorB };
    shader.uniforms.mountainSnowColorA = { value: snowColorA };
    shader.uniforms.mountainSnowColorB = { value: snowColorB };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
        #include <common>
        uniform sampler2D mountainMaskMap;
        uniform bool useMountainMaskMap;
        uniform sampler2D detailAlbedoMap;
        uniform sampler2D detailNormalMap;
        uniform bool useDetailAlbedoMap;
        uniform bool useDetailNormalMap;
        uniform float detailNormalStrength;
        uniform float mountainDetailStrength;
        uniform float mountainDetailSlopeStart;
        uniform float mountainDetailSlopeEnd;
        uniform float mountainDetailSnowStart;
        uniform float mountainDetailSnowEnd;
        uniform float mountainDetailTiling;
        uniform vec3 mountainSoilColorA;
        uniform vec3 mountainSoilColorB;
        uniform vec3 mountainRockColorA;
        uniform vec3 mountainRockColorB;
        uniform vec3 mountainSnowColorA;
        uniform vec3 mountainSnowColorB;
        float mountainDetailWeight = 0.0;
        vec2 mountainDetailUv = vec2(0.0);
        `
      )
      .replace(
        '#include <map_fragment>',
        `
        #include <map_fragment>
        float mountainMaskWeight = useMountainMaskMap ? texture2D(mountainMaskMap, vMapUv).r : 1.0;
        float slope = 0.0;
        #ifdef USE_NORMALMAP
          vec3 encodedNormal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          float encodedNormalZ = sqrt(max(1.0 - dot(encodedNormal.xy, encodedNormal.xy), 0.0));
          slope = clamp(1.0 - encodedNormalZ, 0.0, 1.0);
        #endif
        float heightSample = 0.0;
        #ifdef USE_DISPLACEMENTMAP
          heightSample = texture2D(displacementMap, vDisplacementMapUv).r;
        #endif
        float mountainPresence = mountainMaskWeight;
        #ifdef USE_DISPLACEMENTMAP
          mountainPresence *= smoothstep(0.08, 0.32, heightSample);
        #endif
        float rockWeight = smoothstep(mountainDetailSlopeStart, mountainDetailSlopeEnd, slope * mountainPresence);
        float snowWeight = smoothstep(mountainDetailSnowStart, mountainDetailSnowEnd, heightSample) * mountainPresence;
        rockWeight *= (1.0 - snowWeight);
        float soilWeight = max(1.0 - rockWeight - snowWeight, 0.0);
        mountainDetailUv = fract(vMapUv * mountainDetailTiling);
        float detailWeightBase = 0.2 + 0.8 * (rockWeight + snowWeight);
        mountainDetailWeight = clamp(mountainPresence * mountainDetailStrength * detailWeightBase, 0.0, 1.0);
        vec3 detailAlbedo;
        if (useDetailAlbedoMap) {
          detailAlbedo = texture2D(detailAlbedoMap, mountainDetailUv).rgb;
        } else {
          float detailNoise = fract(sin(dot(mountainDetailUv, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 soilDetail = mix(mountainSoilColorA, mountainSoilColorB, detailNoise);
          vec3 rockDetail = mix(mountainRockColorA, mountainRockColorB, detailNoise);
          vec3 snowDetail = mix(mountainSnowColorA, mountainSnowColorB, detailNoise * 0.65 + 0.35);
          detailAlbedo = soilDetail * soilWeight + rockDetail * rockWeight + snowDetail * snowWeight;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, detailAlbedo, mountainDetailWeight);
        `
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      if (useDetailNormalMap && mountainDetailWeight > 0.0) {
        vec3 detailSample = texture2D(detailNormalMap, mountainDetailUv).xyz * 2.0 - 1.0;
        detailSample.xy *= (detailNormalStrength * mountainDetailWeight);
        detailSample.z = sqrt(max(1.0 - dot(detailSample.xy, detailSample.xy), 0.0));
        normal = normalize(normal + vec3(detailSample.xy, 0.0));
      }
      `
    );
  };
  material.customProgramCacheKey = () =>
    `mountain-detail-${MOUNTAIN_DETAIL_STRENGTH}-${MOUNTAIN_DETAIL_TILING}-${Boolean(detailAlbedo)}-${Boolean(detailNormal)}`;
  material.needsUpdate = true;
  let displacementScale = heightMap ? DISPLACEMENT_SCALE : 0;
  const originalNormalMap = normalMap ?? null;
  let normalMapEnabled = Boolean(originalNormalMap);
  let moonLightEnabled = true;
  let helpersVisible = false;
  const reducedMotionPreferred = Boolean(prefersReducedMotion);
  let timeScale = Math.max(0, initialTimeScale);
  const globe = new THREE.Mesh(geometry, material);
  globe.castShadow = true; // allow the planet to shadow the moon
  globe.receiveShadow = false;
  scene.add(globe);

  if (atmosphereEnabled) {
    atmosphereMesh = createAtmosphereMesh(GLOBE_RADIUS, appliedSegments);
    scene.add(atmosphereMesh);
  }

  const ambientLight = new THREE.AmbientLight('#0d1626', 0.6);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight('#4b6ea9', '#0b101a', 0.35);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#ffd8a8', 1.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.radius = 3.2; // soften the planet shadow on the moon
  sunLight.shadow.bias = -0.0002;
  sunLight.shadow.normalBias = 0.012;
  const shadowCam = sunLight.shadow.camera as THREE.OrthographicCamera;
  const shadowExtent = MOON_ORBIT_RADIUS * 2.2;
  shadowCam.left = -shadowExtent;
  shadowCam.right = shadowExtent;
  shadowCam.top = shadowExtent;
  shadowCam.bottom = -shadowExtent;
  shadowCam.near = 20;
  shadowCam.far = SUN_ORBIT_RADIUS * 1.8;
  shadowCam.updateProjectionMatrix();
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

  sunHelper = new THREE.DirectionalLightHelper(sunLight, GLOBE_RADIUS * 0.6, '#f7d18a');
  sunHelper.visible = false;
  scene.add(sunHelper);

  moonLightHelper = new THREE.PointLightHelper(moonLight, MOON_RADIUS * 1.6, '#c8d7ff');
  moonLightHelper.visible = false;
  scene.add(moonLightHelper);

  if (cloudsEnabled) {
    const cloudResources = createCloudMesh(GLOBE_RADIUS, appliedSegments, renderer);
    cloudMesh = cloudResources.mesh;
    cloudTexture = cloudResources.texture;
    scene.add(cloudMesh);
  }

  const moonToSun = new THREE.Vector3();
  const moonToEarth = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const earthDir = new THREE.Vector3();
  const planetOrigin = new THREE.Vector3(0, 0, 0);

  const spatialSnapshot: SpatialSnapshot = {
    sunPosition: new THREE.Vector3(),
    moonPosition: new THREE.Vector3(),
    planetPosition: planetOrigin.clone(),
    cameraPosition: new THREE.Vector3(),
    cameraDirection: new THREE.Vector3(0, 0, -1),
    cameraUp: new THREE.Vector3(0, 1, 0),
  };

  const emitSpatialUpdate = () => {
    if (!onSpatialUpdate) return;
    camera.updateMatrixWorld();
    spatialSnapshot.sunPosition.copy(sunMesh.position);
    spatialSnapshot.moonPosition.copy(moonMesh.position);
    spatialSnapshot.cameraPosition.copy(camera.position);
    spatialSnapshot.cameraDirection.copy(camera.getWorldDirection(spatialSnapshot.cameraDirection)).normalize();
    spatialSnapshot.cameraUp.copy(camera.up).normalize();
    spatialSnapshot.planetPosition.set(0, 0, 0);
    onSpatialUpdate(spatialSnapshot);
  };

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
    const earthAngularRadius = Math.atan2(GLOBE_RADIUS * 1.35, earthDistance);
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
    const eased = t * t * (3 - 2 * t);
    return THREE.MathUtils.clamp(eased, 0, 1);
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxDistance = SUN_ORBIT_RADIUS * 1.1;
  controls.minDistance = GLOBE_RADIUS * 1.2;

  const baseMinDistance = controls.minDistance;
  const baseMaxDistance = controls.maxDistance;
  const cameraLockDirection = new THREE.Vector3();
  const cameraLockFocus = new THREE.Vector3();
  const cameraLockPosition = new THREE.Vector3();
  const cameraLockUp = new THREE.Vector3(0, 1, 0);
  type CameraLockTargetConfig = {
    id: CameraLockTarget;
    distance: number;
    minDistance: number;
    getFocus: () => THREE.Vector3;
    getAnchorDirection?: (focus: THREE.Vector3) => THREE.Vector3;
    up?: THREE.Vector3;
  };
  const cameraLockTargets: Record<CameraLockTarget, CameraLockTargetConfig> = {
    earth: {
      id: 'earth',
      distance: GLOBE_RADIUS * 3.6,
      minDistance: GLOBE_RADIUS * 1.2,
      getFocus: () => planetOrigin,
      getAnchorDirection: () => {
        cameraLockDirection.copy(camera.getWorldDirection(cameraLockDirection)).multiplyScalar(-1);
        if (cameraLockDirection.lengthSq() < 1e-4) {
          cameraLockDirection.set(0, 0, 1);
        }
        return cameraLockDirection;
      },
      up: cameraLockUp,
    },
    moon: {
      id: 'moon',
      distance: MOON_RADIUS * 7.5,
      minDistance: MOON_RADIUS * 2.1,
      getFocus: () => moonMesh.position,
      getAnchorDirection: (focus) => {
        if (focus.lengthSq() < 1e-6) {
          return cameraLockDirection.set(0, 0, 1);
        }
        // Place the camera beyond the moon so the view initially faces back toward Earth.
        return cameraLockDirection.copy(focus).normalize();
      },
      up: cameraLockUp,
    },
    sun: {
      id: 'sun',
      distance: SUN_RADIUS * 4.5,
      minDistance: SUN_RADIUS * 1.15,
      getFocus: () => sunMesh.position,
      getAnchorDirection: (focus) => {
        if (focus.lengthSq() < 1e-6) {
          return cameraLockDirection.set(0, 0, 1);
        }
        // Place the camera beyond the sun so the view initially faces back toward Earth.
        return cameraLockDirection.copy(focus).normalize();
      },
      up: cameraLockUp,
    },
  };
  let orbitFocus: CameraLockTarget = 'earth';
  let cameraLock: CameraLockTarget | null = null;
  let cameraLockSnap = reducedMotionPreferred;

  let cameraViewMode: 'system' | 'planet' =
    INITIAL_CAMERA_DISTANCE <= PLANET_VIEW_DISTANCE ? 'planet' : 'system';
  let hasEmittedViewState = false;

  const emitCameraViewState = (distance: number) => {
    const nextMode =
      cameraViewMode === 'planet'
        ? distance >= SOLAR_SYSTEM_VIEW_DISTANCE
          ? 'system'
          : 'planet'
        : distance <= PLANET_VIEW_DISTANCE
          ? 'planet'
          : 'system';

    const changed = nextMode !== cameraViewMode;
    cameraViewMode = nextMode;
    if (changed || !hasEmittedViewState) {
      onCameraViewChange?.({
        distance,
        isPlanetView: cameraViewMode === 'planet',
        isSystemView: cameraViewMode === 'system',
      });
      hasEmittedViewState = true;
    }
  };

  const getPlanetDistance = () => camera.position.distanceTo(planetOrigin);

  const notifyCameraDistance = () => {
    const distance = getPlanetDistance();
    onCameraDistanceChange?.(distance);
    emitCameraViewState(distance);
  };

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

  type CameraPose = { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 };

  const applyDistanceClampForTarget = (target: CameraLockTarget | null) => {
    const config = target ? cameraLockTargets[target] : null;
    controls.minDistance = Math.max(baseMinDistance, config?.minDistance ?? baseMinDistance);
    controls.maxDistance = Math.max(baseMaxDistance, config?.distance ?? baseMaxDistance);
  };

  const computeCameraLockPose = (target: CameraLockTarget): CameraPose => {
    const config = cameraLockTargets[target];
    const focus = cameraLockFocus.copy(config.getFocus());
    const anchorDir = config.getAnchorDirection?.(focus) ?? cameraLockDirection.set(0, 0, 1);
    if (anchorDir.lengthSq() < 1e-6) {
      anchorDir.set(0, 0, 1);
    } else {
      anchorDir.normalize();
    }
    const distance = Math.max(config.minDistance, config.distance);
    const position = cameraLockPosition.copy(focus).addScaledVector(anchorDir, distance);
    const up = config.up ?? cameraLockUp;
    return { position: position.clone(), target: focus.clone(), up };
  };

  const setCameraPoseImmediate = (pose: CameraPose) => {
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    camera.up.copy(pose.up);
    camera.lookAt(controls.target);
    notifyCameraDistance();
  };

  const moveCameraToPose = (pose: CameraPose, duration: number) => {
    if (duration <= 0) {
      setCameraPoseImmediate(pose);
      controls.enabled = !cameraLock;
      return;
    }
    spherical.setFromVector3(pose.position);
    startCameraAnimation({
      radius: spherical.radius,
      phi: spherical.phi,
      theta: spherical.theta,
      target: pose.target,
      duration,
    });
  };

  const clearCameraLock = (notify = true) => {
    if (!cameraLock) return;
    const changed = Boolean(cameraLock);
    cameraLock = null;
    cameraLockSnap = reducedMotionPreferred;
    cameraAnimation = null;
    applyDistanceClampForTarget(orbitFocus);
    controls.enabled = true;
    controls.update();
    notifyCameraDistance();
    if (notify && changed) {
      onCameraLockChange?.(null);
    }
  };

  const setCameraLockTarget = (target: CameraLockTarget | null, { snap }: { snap?: boolean } = {}) => {
    if (target === null) {
      if (cameraLock !== null) {
        clearCameraLock();
      }
      return;
    }
    const changed = cameraLock !== target;
    orbitFocus = target;
    cameraLock = target;
    cameraLockSnap = Boolean(snap ?? reducedMotionPreferred);
    applyDistanceClampForTarget(target);
    const pose = computeCameraLockPose(target);
    moveCameraToPose(pose, cameraLockSnap ? 0 : CAMERA_LOCK_DEFAULT_DURATION);
    controls.enabled = false;
    if (changed) {
      onCameraLockChange?.(cameraLock);
    }
  };

  const handleResize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };

  handleResize();
  window.addEventListener('resize', handleResize);

  const horizonRig = {
    worldUp: new THREE.Vector3(0, 1, 0),
    fallbackRight: new THREE.Vector3(1, 0, 0),
    surfaceDir: new THREE.Vector3(),
    surfacePoint: new THREE.Vector3(),
    horizonRight: new THREE.Vector3(),
    horizonForward: new THREE.Vector3(),
    horizonTarget: new THREE.Vector3(),
    blendedTarget: new THREE.Vector3(),
  };

  let hasSweptToHorizon = false;
  let cameraHorizonBlend = 0;

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
    notifyCameraDistance();

    if (cameraAnimation.elapsed >= cameraAnimation.duration) {
      cameraAnimation = null;
      controls.enabled = !cameraLock;
      if (!cameraLock) {
        controls.update();
      }
    }
  };

  const updateCameraLock = (delta: number) => {
    if (!cameraLock || cameraAnimation) {
      return;
    }
    const pose = computeCameraLockPose(cameraLock);
    const followLerp = cameraLockSnap ? 1 : THREE.MathUtils.clamp(delta * CAMERA_LOCK_FOLLOW_RATE, 0, 1);
    camera.position.lerp(pose.position, followLerp);
    controls.target.copy(pose.target);
    camera.up.copy(pose.up);
    camera.lookAt(controls.target);
    notifyCameraDistance();
  };

  const applyCameraHorizonSwing = (delta: number) => {
    const radius = GLOBE_RADIUS;
    const distanceToCenter = camera.position.length();
    const blendStart = radius * CAMERA_HORIZON_BLEND_START_RATIO;
    const blendEnd = radius * CAMERA_HORIZON_BLEND_END_RATIO;
    const blendRange = Math.max(1e-6, blendStart - blendEnd);
    const targetBlend = THREE.MathUtils.clamp((blendStart - distanceToCenter) / blendRange, 0, 1);
    const blendRate = THREE.MathUtils.clamp(delta > 0 ? (delta * 1000) / 180 : 0.12, 0.08, 0.35);
    cameraHorizonBlend = THREE.MathUtils.lerp(cameraHorizonBlend, targetBlend, blendRate);

    if (cameraHorizonBlend <= 0.0001) {
      return;
    }

    horizonRig.surfaceDir.copy(camera.position).normalize();
    horizonRig.surfacePoint.copy(horizonRig.surfaceDir).multiplyScalar(radius);
    horizonRig.worldUp.set(0, 1, 0);
    horizonRig.horizonRight.crossVectors(horizonRig.worldUp, horizonRig.surfaceDir);
    if (horizonRig.horizonRight.lengthSq() < 1e-6) {
      horizonRig.horizonRight.crossVectors(horizonRig.fallbackRight, horizonRig.surfaceDir);
    }
    horizonRig.horizonRight.normalize();
    horizonRig.horizonForward.crossVectors(horizonRig.surfaceDir, horizonRig.horizonRight).normalize();

    const lookAhead = radius * CAMERA_HORIZON_LOOK_AHEAD_RATIO;
    const lookLift = radius * CAMERA_HORIZON_LOOK_LIFT_RATIO;
    horizonRig.horizonTarget
      .copy(horizonRig.surfacePoint)
      .addScaledVector(horizonRig.horizonForward, lookAhead)
      .addScaledVector(horizonRig.surfaceDir, lookLift);

    horizonRig.blendedTarget.copy(controls.target);
    horizonRig.blendedTarget.lerp(horizonRig.horizonTarget, cameraHorizonBlend);
    camera.lookAt(horizonRig.blendedTarget);
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
    if (cameraAnimation || cameraLock) {
      return;
    }
    const distance = getPlanetDistance();
    if (!hasSweptToHorizon && distance <= AUTO_HORIZON_TRIGGER_DISTANCE) {
      sweepToHorizon(true);
      return;
    }
    if (hasSweptToHorizon && distance > AUTO_HORIZON_RESET_DISTANCE) {
      hasSweptToHorizon = false;
    }
    notifyCameraDistance();
  };
  controls.addEventListener('change', onControlsChange);
  notifyCameraDistance();
  emitSpatialUpdate();

  const handleUserCameraIntent = () => {
    if (!cameraLock) return;
    clearCameraLock();
  };
  renderer.domElement.addEventListener('pointerdown', handleUserCameraIntent, { capture: true });
  renderer.domElement.addEventListener('wheel', handleUserCameraIntent, { capture: true, passive: true });

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
    if (sunHelper) {
      sunHelper.visible = helpersVisible;
      sunHelper.update();
    }
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
    const baseIntensity = moonLightEnabled ? MOON_BASE_INTENSITY : 0;
    const occludedIntensity = baseIntensity * eclipseFactor;
    moonLight.intensity = occludedIntensity;
    moonLight.visible = moonLightEnabled && occludedIntensity > 0.001;
    const moonBrightness = THREE.MathUtils.clamp(eclipseFactor, 0, 1);
    moonMaterial.color.setScalar(moonBrightness);
    if (moonLightHelper) {
      moonLightHelper.visible = helpersVisible;
      moonLightHelper.update();
    }
  };

  updateSun(0);
  updateMoon(0);

  const animate = () => {
    const delta = clock.getDelta();
    const scaledDelta = delta * timeScale;
    updateSun(scaledDelta);
    updateMoon(scaledDelta);
    updateCameraAnimation(scaledDelta);
    updateCameraLock(scaledDelta);
    globe.rotation.y -= scaledDelta * GLOBE_ROTATION_SPEED; // opposite direction
    if (cloudMesh?.visible) {
      cloudMesh.rotation.y += scaledDelta * CLOUD_ROTATION_SPEED;
      if (cloudTexture) {
        cloudTexture.offset.x += scaledDelta * CLOUD_ROTATION_SPEED * 0.6;
        cloudTexture.offset.y += scaledDelta * CLOUD_ROTATION_SPEED * 0.2;
      }
    }
    controls.update();
    applyCameraHorizonSwing(scaledDelta);
    emitSpatialUpdate();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  const dispose = () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', handleResize);
    controls.removeEventListener('change', onControlsChange);
    renderer.domElement.removeEventListener('pointerdown', handleUserCameraIntent, true);
    renderer.domElement.removeEventListener('wheel', handleUserCameraIntent, true);
    controls.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
    heightMap?.dispose();
    normalMap?.dispose();
    mountainMask?.dispose();
    if (cloudMesh) {
      (cloudMesh.material as THREE.Material).dispose();
      cloudMesh.geometry.dispose();
      scene.remove(cloudMesh);
    }
    cloudTexture?.dispose();
    if (sunHelper) {
      sunHelper.dispose();
      scene.remove(sunHelper);
    }
    if (moonLightHelper) {
      moonLightHelper.dispose();
      scene.remove(moonLightHelper);
    }
    if (atmosphereMesh) {
      (atmosphereMesh.material as THREE.Material).dispose();
      atmosphereMesh.geometry.dispose();
      scene.remove(atmosphereMesh);
    }
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
    if (ownsRenderer) {
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    }
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
    setAtmosphereVisible: (visible: boolean) => {
      if (atmosphereMesh) {
        atmosphereMesh.visible = visible;
      }
    },
    setCloudsVisible: (visible: boolean) => {
      if (cloudMesh) {
        cloudMesh.visible = visible;
      }
    },
    setNormalMapEnabled: (enabled: boolean) => {
      normalMapEnabled = enabled && Boolean(originalNormalMap);
      material.normalMap = normalMapEnabled ? originalNormalMap : null;
      material.needsUpdate = true;
    },
    setMoonLightEnabled: (enabled: boolean) => {
      moonLightEnabled = enabled;
      moonLight.visible = enabled;
    },
    setLightHelpersVisible: (visible: boolean) => {
      helpersVisible = visible;
      if (sunHelper) {
        sunHelper.visible = visible;
      }
      if (moonLightHelper) {
        moonLightHelper.visible = visible;
      }
    },
    setTimeScale: (scale: number) => {
      timeScale = Math.max(0, Math.min(scale, 10));
    },
    setCameraLock: (target: CameraLockTarget | null, options?: { snap?: boolean }) => {
      setCameraLockTarget(target, options);
    },
    getCameraLock: () => cameraLock,
  };
}
