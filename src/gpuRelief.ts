import * as THREE from 'three';
import {
  GPU_RELIEF_AMPLITUDE,
  GPU_RELIEF_FREQUENCY,
  GPU_RELIEF_OCTAVES,
  GPU_RELIEF_SEED,
  GPU_RELIEF_WARP,
} from './config';

export interface GpuReliefSettings {
  amplitude?: number;
  frequency?: number;
  warp?: number;
  octaves?: number;
  seed?: number;
}

function createRenderer(width: number, height: number): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.NoColorSpace;
    return renderer;
  } catch (error) {
    console.warn('GPU relief renderer unavailable, skipping GPU pass:', error);
    return null;
  }
}

export function applyGpuRelief(
  baseHeight: Uint8Array,
  width: number,
  height: number,
  settings: GpuReliefSettings = {}
): Uint8Array {
  const renderer = createRenderer(width, height);
  if (!renderer) return baseHeight;

  const amplitude = settings.amplitude ?? GPU_RELIEF_AMPLITUDE;
  const frequency = settings.frequency ?? GPU_RELIEF_FREQUENCY;
  const warp = settings.warp ?? GPU_RELIEF_WARP;
  const octaves = Math.max(1, Math.floor(settings.octaves ?? GPU_RELIEF_OCTAVES));
  const seed = settings.seed ?? GPU_RELIEF_SEED;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const baseTexture = new THREE.DataTexture(baseHeight, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  baseTexture.minFilter = THREE.NearestFilter;
  baseTexture.magFilter = THREE.NearestFilter;
  baseTexture.generateMipmaps = false;
  baseTexture.needsUpdate = true;

  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      baseHeight: { value: baseTexture },
      resolution: { value: new THREE.Vector2(width, height) },
      amplitude: { value: amplitude },
      frequency: { value: frequency },
      warp: { value: warp },
      seed: { value: seed },
      octaves: { value: octaves },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D baseHeight;
      uniform vec2 resolution;
      uniform float amplitude;
      uniform float frequency;
      uniform float warp;
      uniform float seed;
      uniform float octaves;
      varying vec2 vUv;

      float hash(vec2 p) {
        float h = dot(p, vec2(127.1, 311.7)) + seed * 17.0;
        return fract(sin(h) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for (int i = 0; i < 8; i++) {
          if (float(i) >= octaves) break;
          value += noise(p * freq) * amp;
          freq *= 2.0;
          amp *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = vUv;
        float base = texture2D(baseHeight, uv).r;
        vec2 warpedUv = uv * frequency;
        vec2 warpVec = vec2(noise(uv * frequency + seed * 3.1), noise(uv * frequency - seed * 2.7)) - 0.5;
        warpedUv += warpVec * warp;
        float relief = fbm(warpedUv);
        float adjusted = clamp(base + (relief - 0.5) * amplitude, 0.0, 1.0);
        gl_FragColor = vec4(adjusted, adjusted, adjusted, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

  const result = new Uint8Array(baseHeight.length);
  for (let i = 0; i < width * height; i += 1) {
    result[i] = pixels[i * 4]; // use red channel
  }

  // cleanup
  quad.geometry.dispose();
  material.dispose();
  baseTexture.dispose();
  target.dispose();
  renderer.dispose();

  return result;
}
