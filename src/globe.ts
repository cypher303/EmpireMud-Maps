import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface GlobeOptions {
  texture: THREE.Texture;
  container: HTMLElement;
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

  const ambient = new THREE.AmbientLight('#dbeafe', 0.45);
  const keyLight = new THREE.DirectionalLight('#f8fafc', 0.65);
  keyLight.position.set(-2.5, 2.5, 5.5);
  scene.add(ambient, keyLight);

  const geometry = new THREE.SphereGeometry(2.4, 128, 128);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0.05,
  });
  const globe = new THREE.Mesh(geometry, material);
  scene.add(globe);

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
  const animate = () => {
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
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };
}
