/**
 * 8D Audio Spatializer Module
 * Web Audio API wrapper for 3D audio positioning with HRTF panning
 */

export type SpatialPattern = 'circle' | 'figure8' | 'bounce';

export interface SpatializerConfig {
  /** Rotation speed in Hz (cycles per second) */
  speed?: number;
  /** Distance radius from listener (meters) */
  radius?: number;
  /** Movement pattern */
  pattern?: SpatialPattern;
  /** Reverb mix (0-1) */
  reverbWet?: number;
  /** EQ frequency (Hz) */
  eqFrequency?: number;
  /** EQ gain (dB) */
  eqGain?: number;
  /** Master volume (0-1) */
  volume?: number;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

// Smoothing constants - critical for preventing clicks/pops
const SMOOTHING_TIME = 0.05; // 50ms for parameter changes
const RAMP_TIME = 0.02; // 20ms for position updates

export class AudioSpatializer {
  private audioContext: AudioContext | null = null;
  private pannerNode: PannerNode | null = null;
  private convolverNode: ConvolverNode | null = null;
  private dryGainNode: GainNode | null = null;
  private wetGainNode: GainNode | null = null;
  private eqNode: BiquadFilterNode | null = null;
  private masterGainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;

  // Animation state
  private animationId: number | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private isPlaying: boolean = false;

  // Spatial parameters
  private speed: number = 0.25; // Hz (1 rotation per 4 seconds)
  private radius: number = 2; // meters
  private pattern: SpatialPattern = 'circle';
  private reverbWet: number = 0.3;
  private volume: number = 1;

  // Position smoothing state
  private lastPosition: Position3D = { x: 0, y: 0, z: 0 };
  private targetPosition: Position3D = { x: 0, y: 0, z: 0 };

  // Callback for position updates (for visualization)
  private onPositionUpdate: ((pos: Position3D) => void) | null = null;

  /**
   * Set callback for position updates
   */
  setPositionCallback(callback: (pos: Position3D) => void): void {
    this.onPositionUpdate = callback;
  }

  /**
   * Initialize the audio context and all nodes
   */
  async init(): Promise<void> {
    if (this.audioContext) return;

    // Create AudioContext
    this.audioContext = new AudioContext();

    // Create PannerNode with HRTF for realistic 3D audio
    this.pannerNode = this.audioContext.createPanner();
    this.pannerNode.panningModel = 'HRTF';
    this.pannerNode.distanceModel = 'inverse';
    this.pannerNode.refDistance = 0.1;
    this.pannerNode.maxDistance = 100;
    this.pannerNode.rolloffFactor = 1;
    this.pannerNode.coneInnerAngle = 360;
    this.pannerNode.coneOuterAngle = 360;
    this.pannerNode.coneOuterGain = 0;

    // Create EQ (BiquadFilter - Peaking)
    this.eqNode = this.audioContext.createBiquadFilter();
    this.eqNode.type = 'peaking';
    this.eqNode.frequency.value = 1000;
    this.eqNode.Q.value = 1;
    this.eqNode.gain.value = 0;

    // Create ConvolverNode for reverb/space effect
    this.convolverNode = this.audioContext.createConvolver();

    // Create dry/wet gain nodes for reverb mixing
    this.dryGainNode = this.audioContext.createGain();
    this.wetGainNode = this.audioContext.createGain();
    this.dryGainNode.gain.value = 1 - this.reverbWet;
    this.wetGainNode.gain.value = this.reverbWet;

    // Create master gain
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = this.volume;

    // Generate default reverb impulse response
    await this.generateDefaultReverb();

    // Connect the audio graph:
    // Source -> EQ -> Panner -> Dry Gain -> Master
    //                          -> Convolver -> Wet Gain -> Master
    // Master -> Destination
    this.pannerNode.connect(this.dryGainNode);
    this.pannerNode.connect(this.convolverNode);
    this.convolverNode.connect(this.wetGainNode);
    this.dryGainNode.connect(this.masterGainNode);
    this.wetGainNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.audioContext.destination);

    // Set initial listener position (at origin, facing +Z)
    this.audioContext.listener.setPosition(0, 0, 0);
    this.audioContext.listener.setOrientation(0, 0, 1, 0, 1, 0);
  }

  /**
   * Generate a default reverb impulse response
   */
  private async generateDefaultReverb(): Promise<void> {
    if (!this.audioContext || !this.convolverNode) return;

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * 2.5; // 2.5 second reverb tail
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Exponential decay with randomness for natural reverb
        const decay = Math.exp(-3 * i / length);
        channelData[i] = (Math.random() * 2 - 1) * decay;
      }
    }

    this.convolverNode.buffer = impulse;
  }

  /**
   * Load audio file (MP3/WAV) and decode to AudioBuffer
   */
  async loadFile(file: File | string): Promise<void> {
    if (!this.audioContext) {
      await this.init();
    }

    let arrayBuffer: ArrayBuffer;

    if (typeof file === 'string') {
      // Load from URL
      const response = await fetch(file);
      if (!response.ok) {
        throw new Error(`Failed to load audio file: ${response.statusText}`);
      }
      arrayBuffer = await response.arrayBuffer();
    } else {
      // Load from File object
      arrayBuffer = await file.arrayBuffer();
    }

    // Decode audio data to AudioBuffer
    this.audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
  }

  /**
   * Load audio from ArrayBuffer directly
   */
  async loadBuffer(buffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      await this.init();
    }
    this.audioBuffer = await this.audioContext!.decodeAudioData(buffer);
  }

  /**
   * Start playback and spatial movement
   */
  play(): void {
    if (!this.audioContext || !this.audioBuffer || this.isPlaying) return;

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Create new source node
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.loop = true;

    // Connect: Source -> EQ -> Panner
    this.sourceNode.connect(this.eqNode!);
    this.eqNode!.connect(this.pannerNode!);

    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.stopAnimation();
      }
    };

    // Start playback from paused position
    const offset = this.pausedTime % this.audioBuffer.duration;
    this.sourceNode.start(0, offset);

    this.isPlaying = true;
    this.startTime = this.audioContext.currentTime - this.pausedTime;

    // Start spatial animation loop
    this.startAnimation();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.isPlaying || !this.sourceNode) return;

    this.pausedTime = this.audioContext!.currentTime - this.startTime;
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isPlaying = false;

    this.stopAnimation();
  }

  /**
   * Stop playback and reset
   */
  stop(): void {
    this.pause();
    this.pausedTime = 0;
    this.resetPosition();
  }

  /**
   * Set rotation speed (Hz) - cycles per second
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.01, Math.min(10, speed));
  }

  /**
   * Get current speed
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * Set orbit radius (meters)
   */
  setRadius(radius: number): void {
    this.radius = Math.max(0.1, Math.min(50, radius));
  }

  /**
   * Get current radius
   */
  getRadius(): number {
    return this.radius;
  }

  /**
   * Set movement pattern
   */
  setPattern(pattern: SpatialPattern): void {
    this.pattern = pattern;
  }

  /**
   * Get current pattern
   */
  getPattern(): SpatialPattern {
    return this.pattern;
  }

  /**
   * Set reverb wet/dry mix (0-1) with smooth transition
   */
  setReverbWet(wet: number): void {
    if (!this.dryGainNode || !this.wetGainNode || !this.audioContext) return;

    this.reverbWet = Math.max(0, Math.min(1, wet));

    const currentTime = this.audioContext.currentTime;

    // Smooth ramp to prevent clicks
    this.dryGainNode.gain.cancelScheduledValues(currentTime);
    this.dryGainNode.gain.setValueAtTime(this.dryGainNode.gain.value, currentTime);
    this.dryGainNode.gain.linearRampToValueAtTime(1 - this.reverbWet, currentTime + SMOOTHING_TIME);

    this.wetGainNode.gain.cancelScheduledValues(currentTime);
    this.wetGainNode.gain.setValueAtTime(this.wetGainNode.gain.value, currentTime);
    this.wetGainNode.gain.linearRampToValueAtTime(this.reverbWet, currentTime + SMOOTHING_TIME);
  }

  /**
   * Get reverb wet
   */
  getReverbWet(): number {
    return this.reverbWet;
  }

  /**
   * Set EQ parameters with smooth transition
   */
  setEQ(frequency: number, gain: number): void {
    if (!this.eqNode || !this.audioContext) return;

    const currentTime = this.audioContext.currentTime;

    this.eqNode.frequency.cancelScheduledValues(currentTime);
    this.eqNode.frequency.setValueAtTime(this.eqNode.frequency.value, currentTime);
    this.eqNode.frequency.linearRampToValueAtTime(frequency, currentTime + SMOOTHING_TIME);

    this.eqNode.gain.cancelScheduledValues(currentTime);
    this.eqNode.gain.setValueAtTime(this.eqNode.gain.value, currentTime);
    this.eqNode.gain.linearRampToValueAtTime(gain, currentTime + SMOOTHING_TIME);
  }

  /**
   * Set master volume (0-1) with smooth transition
   */
  setVolume(volume: number): void {
    if (!this.masterGainNode || !this.audioContext) return;

    this.volume = Math.max(0, Math.min(1, volume));

    const currentTime = this.audioContext.currentTime;
    this.masterGainNode.gain.cancelScheduledValues(currentTime);
    this.masterGainNode.gain.setValueAtTime(this.masterGainNode.gain.value, currentTime);
    this.masterGainNode.gain.linearRampToValueAtTime(this.volume, currentTime + SMOOTHING_TIME);
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Set custom reverb impulse response
   */
  async setReverbImpulse(file: File | string): Promise<void> {
    if (!this.audioContext || !this.convolverNode) return;

    let arrayBuffer: ArrayBuffer;

    if (typeof file === 'string') {
      const response = await fetch(file);
      arrayBuffer = await response.arrayBuffer();
    } else {
      arrayBuffer = await file.arrayBuffer();
    }

    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.convolverNode.buffer = audioBuffer;
  }

  /**
   * Get current playback state
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current 3D position
   */
  getPosition(): Position3D {
    return { ...this.lastPosition };
  }

  /**
   * Set position manually (for drag interaction)
   */
  setPositionManually(x: number, z: number): void {
    if (!this.pannerNode || !this.audioContext) return;

    // Stop animation
    this.stopAnimation();

    // Update position
    this.lastPosition.x = x;
    this.lastPosition.z = z;
    this.targetPosition.x = x;
    this.targetPosition.z = z;

    const currentTime = this.audioContext.currentTime;
    this.pannerNode.positionX.setValueAtTime(x, currentTime);
    this.pannerNode.positionY.setValueAtTime(0, currentTime);
    this.pannerNode.positionZ.setValueAtTime(z, currentTime);

    // Update radius based on distance from center
    this.radius = Math.sqrt(x * x + z * z);

    // Notify callback
    if (this.onPositionUpdate) {
      this.onPositionUpdate(this.lastPosition);
    }
  }

  /**
   * Resume auto animation
   */
  resumeAnimation(): void {
    if (this.isPlaying && !this.animationId) {
      this.startAnimation();
    }
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (!this.audioContext) return 0;
    return (this.audioContext.currentTime - this.startTime) % (this.audioBuffer?.duration || 1);
  }

  /**
   * Get audio duration
   */
  getDuration(): number {
    return this.audioBuffer?.duration || 0;
  }

  /**
   * Get audio buffer
   */
  getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  /**
   * Start spatial animation loop using requestAnimationFrame
   */
  private startAnimation(): void {
    const animate = () => {
      if (!this.isPlaying || !this.pannerNode || !this.audioContext) return;

      const currentTime = this.audioContext.currentTime;
      const elapsed = currentTime - this.startTime;

      // Calculate target position based on pattern
      this.targetPosition = this.calculatePosition(elapsed);

      // Smoothly update panner position
      this.updatePannerPosition(currentTime);

      // Notify callback for visualization
      if (this.onPositionUpdate) {
        this.onPositionUpdate(this.lastPosition);
      }

      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  /**
   * Stop animation loop
   */
  private stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Calculate 3D position based on pattern
   */
  private calculatePosition(time: number): Position3D {
    // Angular position in radians
    const phase = time * this.speed * 2 * Math.PI;

    let x: number, y: number, z: number;

    switch (this.pattern) {
      case 'circle':
        // Circular orbit around listener at ear level
        x = Math.sin(phase) * this.radius;
        y = 0;
        z = Math.cos(phase) * this.radius;
        break;

      case 'figure8':
        // Figure-8 / Lissajous pattern with vertical component
        x = Math.sin(phase) * this.radius;
        y = Math.sin(phase * 2) * (this.radius * 0.3);
        z = Math.sin(phase) * Math.cos(phase) * this.radius * 2;
        break;

      case 'bounce':
        // Linear left-right bounce
        x = Math.sin(phase) * this.radius;
        y = 0;
        z = 0;
        break;

      default:
        x = this.radius;
        y = 0;
        z = 0;
    }

    return { x, y, z };
  }

  /**
   * Update panner position with smooth interpolation
   * KEY: Uses AudioParam.linearRampToValueAtTime instead of setValueAtTime
   * This prevents clicks/pops by ensuring gradual position transitions
   */
  private updatePannerPosition(currentTime: number): void {
    if (!this.pannerNode) return;

    const smoothFactor = 0.15;
    const rampEndTime = currentTime + RAMP_TIME;

    // X position - smooth ramp
    this.pannerNode.positionX.cancelScheduledValues(currentTime);
    this.pannerNode.positionX.setValueAtTime(this.lastPosition.x, currentTime);
    this.pannerNode.positionX.linearRampToValueAtTime(
      this.lerp(this.lastPosition.x, this.targetPosition.x, smoothFactor),
      rampEndTime
    );

    // Y position - smooth ramp
    this.pannerNode.positionY.cancelScheduledValues(currentTime);
    this.pannerNode.positionY.setValueAtTime(this.lastPosition.y, currentTime);
    this.pannerNode.positionY.linearRampToValueAtTime(
      this.lerp(this.lastPosition.y, this.targetPosition.y, smoothFactor),
      rampEndTime
    );

    // Z position - smooth ramp
    this.pannerNode.positionZ.cancelScheduledValues(currentTime);
    this.pannerNode.positionZ.setValueAtTime(this.lastPosition.z, currentTime);
    this.pannerNode.positionZ.linearRampToValueAtTime(
      this.lerp(this.lastPosition.z, this.targetPosition.z, smoothFactor),
      rampEndTime
    );

    // Store smoothed position for next frame
    this.lastPosition = {
      x: this.lerp(this.lastPosition.x, this.targetPosition.x, smoothFactor),
      y: this.lerp(this.lastPosition.y, this.targetPosition.y, smoothFactor),
      z: this.lerp(this.lastPosition.z, this.targetPosition.z, smoothFactor)
    };
  }

  /**
   * Linear interpolation helper
   */
  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }

  /**
   * Reset position to initial state
   */
  private resetPosition(): void {
    this.lastPosition = { x: this.radius, y: 0, z: 0 };
    this.targetPosition = { x: this.radius, y: 0, z: 0 };

    if (this.pannerNode && this.audioContext) {
      const currentTime = this.audioContext.currentTime;
      this.pannerNode.positionX.setValueAtTime(this.radius, currentTime);
      this.pannerNode.positionY.setValueAtTime(0, currentTime);
      this.pannerNode.positionZ.setValueAtTime(0, currentTime);
    }
  }

  /**
   * Clean up and release all resources
   */
  dispose(): void {
    this.stop();

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.pannerNode) {
      this.pannerNode.disconnect();
      this.pannerNode = null;
    }
    if (this.convolverNode) {
      this.convolverNode.disconnect();
      this.convolverNode = null;
    }
    if (this.dryGainNode) {
      this.dryGainNode.disconnect();
      this.dryGainNode = null;
    }
    if (this.wetGainNode) {
      this.wetGainNode.disconnect();
      this.wetGainNode = null;
    }
    if (this.eqNode) {
      this.eqNode.disconnect();
      this.eqNode = null;
    }
    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
      this.masterGainNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBuffer = null;
    this.onPositionUpdate = null;
  }
}

/**
 * Factory function for convenience
 */
export function createSpatializer(config?: SpatializerConfig): AudioSpatializer {
  const spatializer = new AudioSpatializer();

  if (config) {
    if (config.speed !== undefined) spatializer.setSpeed(config.speed);
    if (config.radius !== undefined) spatializer.setRadius(config.radius);
    if (config.pattern !== undefined) spatializer.setPattern(config.pattern);
    if (config.reverbWet !== undefined) spatializer.setReverbWet(config.reverbWet);
    if (config.volume !== undefined) spatializer.setVolume(config.volume);
  }

  return spatializer;
}
