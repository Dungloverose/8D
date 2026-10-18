/**
 * AudioExporter Module
 * Render 8D audio offline using OfflineAudioContext and export to WAV
 */

import { SpatialPattern } from './AudioSpatializer';

export interface ExportConfig {
  /** Rotation speed in Hz */
  speed: number;
  /** Distance radius from listener (meters) */
  radius: number;
  /** Movement pattern */
  pattern: SpatialPattern;
  /** Reverb mix (0-1) */
  reverbWet: number;
  /** Master volume (0-1) */
  volume: number;
}

export interface ExportProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Current rendering phase */
  phase: 'preparing' | 'rendering' | 'encoding' | 'complete';
  /** Estimated time remaining in seconds */
  timeRemaining?: number;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  // Create WAV file
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // Bits per sample

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      // Convert to 16-bit integer
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Generate reverb impulse response
 */
function generateReverbImpulse(
  offlineCtx: OfflineAudioContext,
  duration: number = 2.5
): AudioBuffer {
  const sampleRate = offlineCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = offlineCtx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-3 * i / length);
      channelData[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  return impulse;
}

/**
 * Calculate 3D position based on pattern and time
 */
function calculatePosition(
  time: number,
  speed: number,
  radius: number,
  pattern: SpatialPattern
): { x: number; y: number; z: number } {
  const phase = time * speed * 2 * Math.PI;

  switch (pattern) {
    case 'circle':
      return {
        x: Math.sin(phase) * radius,
        y: 0,
        z: Math.cos(phase) * radius,
      };

    case 'figure8':
      return {
        x: Math.sin(phase) * radius,
        y: Math.sin(phase * 2) * (radius * 0.3),
        z: Math.sin(phase) * Math.cos(phase) * radius * 2,
      };

    case 'bounce':
      return {
        x: Math.sin(phase) * radius,
        y: 0,
        z: 0,
      };

    default:
      return { x: radius, y: 0, z: 0 };
  }
}

/**
 * Export 8D audio from AudioBuffer
 *
 * Uses OfflineAudioContext to render the full audio with all 8D effects
 * (HRTF panning, position automation, reverb) at maximum speed.
 */
export async function export8DAudio(
  sourceBuffer: AudioBuffer,
  config: ExportConfig,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  const { speed, radius, pattern, reverbWet, volume } = config;
  const duration = sourceBuffer.duration;
  const sampleRate = sourceBuffer.sampleRate;
  const numChannels = 2; // Always stereo output for 8D effect

  // Report progress
  onProgress?.({ percent: 0, phase: 'preparing' });

  // Create OfflineAudioContext
  // Use the same sample rate as source for best quality
  const offlineCtx = new OfflineAudioContext(
    numChannels,
    Math.ceil(duration * sampleRate),
    sampleRate
  );

  // Create audio nodes
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  // EQ node
  const eqNode = offlineCtx.createBiquadFilter();
  eqNode.type = 'peaking';
  eqNode.frequency.value = 1000;
  eqNode.Q.value = 1;
  eqNode.gain.value = 0;

  // Panner with HRTF for 3D spatial effect
  const panner = offlineCtx.createPanner();
  // Try HRTF first, fallback to equalpower if not supported
  try {
    panner.panningModel = 'HRTF';
  } catch {
    console.warn('HRTF not supported in OfflineAudioContext, using equalpower');
    panner.panningModel = 'equalpower';
  }
  panner.distanceModel = 'inverse';
  panner.refDistance = 0.1;
  panner.maxDistance = 100;
  panner.rolloffFactor = 1;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  panner.coneOuterGain = 0;

  // Convolver for reverb
  const convolver = offlineCtx.createConvolver();
  convolver.buffer = generateReverbImpulse(offlineCtx, 2.5);

  // Dry/wet gains
  const dryGain = offlineCtx.createGain();
  dryGain.gain.value = 1 - reverbWet;

  const wetGain = offlineCtx.createGain();
  wetGain.gain.value = reverbWet;

  // Master gain
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = volume;

  // Connect the graph:
  // Source -> EQ -> Panner -> (Dry Gain + Convolver -> Wet Gain) -> Master Gain -> Destination
  source.connect(eqNode);
  eqNode.connect(panner);

  // Dry path
  panner.connect(dryGain);

  // Wet path (reverb)
  panner.connect(convolver);
  convolver.connect(wetGain);

  // Mix to master
  dryGain.connect(masterGain);
  wetGain.connect(masterGain);

  // To output
  masterGain.connect(offlineCtx.destination);

  // Set listener position at origin
  offlineCtx.listener.setPosition(0, 0, 0);
  offlineCtx.listener.setOrientation(0, 0, 1, 0, 1, 0);

  // ─── Position Automation ───
  // Schedule position changes throughout the audio
  // We'll update position every 50ms for smooth movement

  onProgress?.({ percent: 5, phase: 'rendering' });

  const updateInterval = 0.05; // 50ms steps
  const totalSteps = Math.ceil(duration / updateInterval);

  for (let step = 0; step <= totalSteps; step++) {
    const time = step * updateInterval;

    // Calculate position at this time
    const pos = calculatePosition(time, speed, radius, pattern);

    // Schedule position parameters at the corresponding render time
    panner.positionX.setValueAtTime(pos.x, time);
    panner.positionY.setValueAtTime(pos.y, time);
    panner.positionZ.setValueAtTime(pos.z, time);
  }

  // CRITICAL: Start the source at time 0, otherwise no audio will play!
  source.start(0);

  // Start rendering
  const renderedBuffer = await offlineCtx.startRendering();

  onProgress?.({ percent: 80, phase: 'encoding' });

  // Convert to WAV
  const wavBlob = audioBufferToWav(renderedBuffer);

  onProgress?.({ percent: 100, phase: 'complete', timeRemaining: 0 });

  return wavBlob;
}

/**
 * Trigger file download
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate export filename from original
 */
export function generateExportFilename(originalName: string): string {
  // Remove extension
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  // Add 8D suffix
  return `${baseName}_8D.wav`;
}
