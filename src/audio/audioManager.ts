import type { AudioLayerConfig, SpatialAudioConfig } from './soundConfig';

type Vec3 = { x: number; y: number; z: number };

type LayerState = {
  name: string;
  group: string;
  config: AudioLayerConfig;
  gainNode: GainNode | null;
  pannerNode: PannerNode | null;
  filterNode: BiquadFilterNode | null;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  currentGain: number;
  failed?: boolean;
};

export type GroupConfig = Record<string, AudioLayerConfig>;

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private layers = new Map<string, LayerState>();
  private groups = new Map<string, string[]>();
  private activeGroup: string | null = null;

  async init(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      return;
    }
    const context = new AudioContext();
    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);
    this.context = context;
    this.masterGain = masterGain;

    // Attach gain nodes for any pre-registered layers
    this.layers.forEach((layer) => {
      layer.gainNode = this.createGainNode(layer.currentGain);
      if (layer.config.spatial && !layer.pannerNode) {
        layer.pannerNode = this.createPannerNode(layer.config.spatial);
      }
      this.connectLayerNodes(layer);
    });
  }

  registerGroup(groupName: string, config: GroupConfig): void {
    const context = this.requireContext('registerGroup');
    const layerNames: string[] = [];

    Object.entries(config).forEach(([name, layerConfig]) => {
      const existing = this.layers.get(name);
      if (existing) {
        layerNames.push(existing.name);
        return;
      }
      const pannerNode = layerConfig.spatial ? this.createPannerNode(layerConfig.spatial) : null;
      const state: LayerState = {
        name,
        group: groupName,
        config: layerConfig,
        gainNode: this.createGainNode(layerConfig.baseGain),
        pannerNode,
        filterNode: null,
        buffer: null,
        source: null,
        currentGain: layerConfig.baseGain,
        failed: false,
      };
      this.connectLayerNodes(state);
      this.layers.set(name, state);
      layerNames.push(name);
    });

    this.groups.set(groupName, layerNames);
    // Ensure context is active for iOS-style suspended cases
    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  getActiveGroup(): string | null {
    return this.activeGroup;
  }

  async activateGroup(groupName: string, { fadeDurationMs = 1200 } = {}): Promise<void> {
    const layerNames = this.groups.get(groupName);
    if (!layerNames || layerNames.length === 0) return;

    await this.ensureContextReady();
    if (this.activeGroup && this.activeGroup !== groupName) {
      await this.fadeGroup(this.activeGroup, 0, fadeDurationMs);
      await this.stopGroup(this.activeGroup);
    }

    this.activeGroup = groupName;
    await Promise.all(layerNames.map((name) => this.ensureLayerPlaying(name, 0)));
    await Promise.all(
      layerNames.map((name) => this.fadeLayer(name, this.requireLayer(name).config.baseGain, fadeDurationMs, 0))
    );
  }

  async fadeGroup(groupName: string, targetGain: number, durationMs = 1000): Promise<void> {
    const layerNames = this.groups.get(groupName);
    if (!layerNames) return;
    await Promise.all(layerNames.map((name) => this.fadeLayer(name, targetGain, durationMs)));
  }

  async stopGroup(groupName: string): Promise<void> {
    const layerNames = this.groups.get(groupName);
    if (!layerNames) return;
    layerNames.forEach((name) => this.stopLayer(name));
    if (this.activeGroup === groupName) {
      this.activeGroup = null;
    }
  }

  async crossfadeGroups(fromGroup: string | null, toGroup: string, durationMs: number): Promise<void> {
    const targetLayers = this.groups.get(toGroup);
    if (!targetLayers || targetLayers.length === 0) return;

    await Promise.all(targetLayers.map((name) => this.ensureLayerPlaying(name, 0)));

    const fadeIn = Promise.all(
      targetLayers.map((name) => this.fadeLayer(name, this.requireLayer(name).config.baseGain, durationMs, 0))
    );

    const fadeOut =
      fromGroup && fromGroup === this.activeGroup ? this.fadeGroup(fromGroup, 0, durationMs) : Promise.resolve();

    await Promise.all([fadeIn, fadeOut]);

    if (fromGroup && fromGroup === this.activeGroup) {
      await this.stopGroup(fromGroup);
    }

    this.activeGroup = toGroup;
  }

  async startGroup(groupName: string, startGain = 0): Promise<void> {
    const layerNames = this.groups.get(groupName);
    if (!layerNames || layerNames.length === 0) return;
    await Promise.all(layerNames.map((name) => this.ensureLayerPlaying(name, startGain).catch(() => {})));
  }

  async setLayerGain(name: string, targetGain: number, durationMs = 220): Promise<void> {
    const layer = await this.ensureLayerPlaying(name).catch(() => null);
    if (!layer || layer.failed) return;
    const context = await this.ensureContextReady();
    const gain = layer.gainNode?.gain;
    if (!gain) return;
    const now = context.currentTime;
    gain.cancelScheduledValues(now);
    gain.linearRampToValueAtTime(targetGain, now + durationMs / 1000);
    layer.currentGain = targetGain;
  }

  async setGroupGain(groupName: string, multiplier: number, durationMs = 220): Promise<void> {
    const layerNames = this.groups.get(groupName);
    if (!layerNames || layerNames.length === 0) return;
    await Promise.all(
      layerNames.map((name) => {
        const layer = this.requireLayer(name);
        if (layer.failed) return Promise.resolve();
        const targetGain = layer.config.baseGain * multiplier;
        return this.setLayerGain(name, targetGain, durationMs);
      })
    );
  }

  async setLayerLowpass(name: string, frequencyHz: number, durationMs = 140): Promise<void> {
    const layer = await this.ensureLayerPlaying(name).catch(() => null);
    if (!layer || layer.failed) return;
    const context = await this.ensureContextReady();
    if (!layer.filterNode) {
      layer.filterNode = this.createFilterNode();
      this.connectLayerNodes(layer);
    }
    const freq = layer.filterNode.frequency;
    const now = context.currentTime;
    freq.cancelScheduledValues(now);
    freq.linearRampToValueAtTime(frequencyHz, now + durationMs / 1000);
  }

  async preloadGroup(groupName: string): Promise<void> {
    const layerNames = this.groups.get(groupName);
    if (!layerNames || layerNames.length === 0) return;

    await Promise.all(
      layerNames.map(async (name) => {
        const layer = this.requireLayer(name);
        if (!layer.buffer) {
          await this.loadBuffer(layer);
        }
      })
    );
  }

  async playLayer(name: string, loop = true): Promise<void> {
    const layer = await this.ensureLayerPlaying(name).catch(() => null);
    if (!layer || layer.failed) return;
    if (layer.source) {
      layer.source.loop = loop;
    }
  }

  setLayerPosition(name: string, position: Vec3): void {
    const layer = this.layers.get(name);
    if (!layer || layer.failed || !layer.pannerNode || !this.context) return;
    const time = this.context.currentTime;
    this.setAudioParam(layer.pannerNode.positionX, position.x, time);
    this.setAudioParam(layer.pannerNode.positionY, position.y, time);
    this.setAudioParam(layer.pannerNode.positionZ, position.z, time);
  }

  updateListener(position: Vec3, forward: Vec3, up: Vec3): void {
    if (!this.context) return;
    const listener = this.context.listener;
    const time = this.context.currentTime;
    this.setListenerPosition(listener, position, time);
    this.setListenerOrientation(listener, forward, up, time);
  }

  async fadeLayer(name: string, targetGain: number, durationMs = 1000, startGain?: number): Promise<void> {
    const layer = await this.ensureLayerPlaying(name, startGain);
    const context = await this.ensureContextReady();
    const gain = layer.gainNode?.gain;
    if (!gain) return;
    const now = context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(startGain ?? gain.value, now);
    gain.linearRampToValueAtTime(targetGain, now + durationMs / 1000);
    layer.currentGain = targetGain;
    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
  }

  stopLayer(name: string): void {
    const layer = this.layers.get(name);
    if (!layer) return;
    if (layer.source) {
      try {
        layer.source.stop();
      } catch (error) {
        // Ignore stop errors; source may already be stopped
      }
      layer.source.disconnect();
      layer.source = null;
    }
    if (layer.gainNode) {
      layer.currentGain = layer.gainNode.gain.value;
    }
  }

  private async loadBuffer(layer: LayerState): Promise<AudioBuffer> {
    if (layer.buffer) return layer.buffer;
    const context = this.requireContext('loadBuffer');
    const response = await fetch(layer.config.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio ${layer.config.url}: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    layer.buffer = decoded;
    return decoded;
  }

  private createGainNode(initialValue: number): GainNode {
    const context = this.requireContext('createGainNode');
    const gainNode = context.createGain();
    gainNode.gain.value = initialValue;
    return gainNode;
  }

  private createPannerNode(spatialConfig: SpatialAudioConfig): PannerNode {
    const context = this.requireContext('createPannerNode');
    const panner = context.createPanner();
    panner.panningModel = spatialConfig.panningModel ?? 'HRTF';
    panner.distanceModel = spatialConfig.distanceModel ?? 'inverse';
    panner.refDistance = spatialConfig.refDistance ?? 10;
    panner.maxDistance = spatialConfig.maxDistance ?? 1000;
    panner.rolloffFactor = spatialConfig.rolloffFactor ?? 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    const now = context.currentTime;
    this.setAudioParam(panner.positionX, 0, now);
    this.setAudioParam(panner.positionY, 0, now);
    this.setAudioParam(panner.positionZ, 0, now);
    return panner;
  }

  private createFilterNode(): BiquadFilterNode {
    const context = this.requireContext('createFilterNode');
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.7;
    return filter;
  }

  private connectLayerNodes(layer: LayerState): void {
    if (!this.masterGain) return;
    const chain: (AudioNode | null)[] = [layer.pannerNode, layer.filterNode, layer.gainNode, this.masterGain];
    for (let i = 0; i < chain.length - 1; i += 1) {
      const current = chain[i];
      if (!current) continue;
      const next = chain.slice(i + 1).find((node) => node !== null);
      if (!next) break;
      try {
        current.disconnect();
      } catch {
        // ignore disconnection errors
      }
      current.connect(next);
    }
  }

  private async ensureLayerPlaying(name: string, startGain?: number): Promise<LayerState> {
    const layer = this.requireLayer(name);
    if (layer.failed) {
      return layer;
    }
    const context = await this.ensureContextReady();
    try {
      await this.loadBuffer(layer);
    } catch (error) {
      console.warn(`Skipping audio layer ${name} due to load/decode failure`, error);
      layer.failed = true;
      return layer;
    }

    if (!layer.gainNode) {
      layer.gainNode = this.createGainNode(startGain ?? layer.currentGain);
      if (typeof startGain === 'number') {
        layer.currentGain = startGain;
      }
    } else if (typeof startGain === 'number') {
      layer.gainNode.gain.setValueAtTime(startGain, context.currentTime);
      layer.currentGain = startGain;
    }

    if (!layer.pannerNode && layer.config.spatial) {
      layer.pannerNode = this.createPannerNode(layer.config.spatial);
    }

    this.connectLayerNodes(layer);

    if (layer.source) {
      return layer;
    }

    const source = context.createBufferSource();
    source.buffer = layer.buffer;
    source.loop = true;
    const destination = layer.pannerNode ?? layer.filterNode ?? layer.gainNode ?? this.requireMasterGain();
    source.connect(destination);
    source.onended = () => {
      if (layer.source === source) {
        layer.source = null;
      }
    };
    source.start();
    layer.source = source;
    return layer;
  }

  private requireLayer(name: string): LayerState {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Unknown audio layer: ${name}`);
    }
    return layer;
  }

  private requireContext(action: string): AudioContext {
    if (!this.context) {
      throw new Error(`AudioContext not initialized for ${action}`);
    }
    return this.context;
  }

  private requireMasterGain(): GainNode {
    if (!this.masterGain) {
      throw new Error('Audio master gain is unavailable');
    }
    return this.masterGain;
  }

  private async ensureContextReady(): Promise<AudioContext> {
    await this.init();
    return this.requireContext('ensureContextReady');
  }

  private setAudioParam(param: AudioParam | null | undefined, value: number, time: number): void {
    try {
      param?.setValueAtTime(value, time);
    } catch (error) {
      // Ignore setter errors on unsupported params
    }
  }

  private setListenerPosition(listener: AudioListener, position: Vec3, time: number): void {
    const positionX = (listener as unknown as { positionX?: AudioParam }).positionX;
    if (positionX) {
      this.setAudioParam(positionX, position.x, time);
      this.setAudioParam((listener as unknown as { positionY?: AudioParam }).positionY, position.y, time);
      this.setAudioParam((listener as unknown as { positionZ?: AudioParam }).positionZ, position.z, time);
      return;
    }
    const legacyPosition = (listener as unknown as { setPosition?: (x: number, y: number, z: number) => void })
      .setPosition;
    if (legacyPosition) {
      legacyPosition.call(listener, position.x, position.y, position.z);
    }
  }

  private setListenerOrientation(listener: AudioListener, forward: Vec3, up: Vec3, time: number): void {
    const forwardX = (listener as unknown as { forwardX?: AudioParam }).forwardX;
    if (forwardX) {
      this.setAudioParam(forwardX, forward.x, time);
      this.setAudioParam((listener as unknown as { forwardY?: AudioParam }).forwardY, forward.y, time);
      this.setAudioParam((listener as unknown as { forwardZ?: AudioParam }).forwardZ, forward.z, time);
      this.setAudioParam((listener as unknown as { upX?: AudioParam }).upX, up.x, time);
      this.setAudioParam((listener as unknown as { upY?: AudioParam }).upY, up.y, time);
      this.setAudioParam((listener as unknown as { upZ?: AudioParam }).upZ, up.z, time);
      return;
    }
    const legacyOrientation = (
      listener as unknown as {
        setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      }
    ).setOrientation;
    if (legacyOrientation) {
      legacyOrientation.call(listener, forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }
}
