import type { AudioLayerConfig } from './soundConfig';

type LayerState = {
  name: string;
  group: string;
  config: AudioLayerConfig;
  gainNode: GainNode | null;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  currentGain: number;
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
      const state: LayerState = {
        name,
        group: groupName,
        config: layerConfig,
        gainNode: this.createGainNode(layerConfig.baseGain),
        buffer: null,
        source: null,
        currentGain: layerConfig.baseGain,
      };
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
    const layer = await this.ensureLayerPlaying(name);
    if (layer.source) {
      layer.source.loop = loop;
    }
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
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    layer.buffer = decoded;
    return decoded;
  }

  private createGainNode(initialValue: number): GainNode {
    const context = this.requireContext('createGainNode');
    const gainNode = context.createGain();
    gainNode.gain.value = initialValue;
    gainNode.connect(this.requireMasterGain());
    return gainNode;
  }

  private async ensureLayerPlaying(name: string, startGain?: number): Promise<LayerState> {
    const layer = this.requireLayer(name);
    const context = await this.ensureContextReady();
    await this.loadBuffer(layer);

    if (!layer.gainNode) {
      layer.gainNode = this.createGainNode(startGain ?? layer.currentGain);
    } else if (typeof startGain === 'number') {
      layer.gainNode.gain.setValueAtTime(startGain, context.currentTime);
      layer.currentGain = startGain;
    }

    if (layer.source) {
      return layer;
    }

    const source = context.createBufferSource();
    source.buffer = layer.buffer;
    source.loop = true;
    source.connect(layer.gainNode ?? this.requireMasterGain());
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
}
