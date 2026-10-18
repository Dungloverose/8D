/**
 * UploadZone Component
 * Drag-and-drop file upload with waveform visualization
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

interface UploadZoneProps {
  onFileLoaded: (file: File) => void;
  audioBuffer: AudioBuffer | null;
  isLoading: boolean;
  fileName: string;
}

// Draw waveform onto a canvas from an AudioBuffer
function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const data = buffer.getChannelData(0); // left channel
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, width, height);

  // Center line
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, amp);
  ctx.lineTo(width, amp);
  ctx.stroke();

  // Gradient for waveform
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#00ffff');
  gradient.addColorStop(0.5, '#a855f7');
  gradient.addColorStop(1, '#00ffff');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    let min = 1.0;
    let max = -1.0;

    for (let j = 0; j < step; j++) {
      const sample = data[x * step + j] ?? 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    const yLow = (1 + min) * amp;
    const yHigh = (1 + max) * amp;

    if (x === 0) {
      ctx.moveTo(x, yLow);
    }
    ctx.lineTo(x, yLow);
    ctx.lineTo(x, yHigh);
  }

  ctx.stroke();

  // Reflection (mirrored, faded)
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.scale(1, -1);
  ctx.translate(0, -height);
  ctx.stroke();
  ctx.restore();
}

const UploadZone: React.FC<UploadZoneProps> = ({
  onFileLoaded,
  audioBuffer,
  isLoading,
  fileName,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Re-draw waveform whenever audioBuffer changes
  useEffect(() => {
    if (!canvasRef.current || !audioBuffer) return;

    // Set canvas resolution to match its display size
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    drawWaveform(canvas, audioBuffer);
  }, [audioBuffer]);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('audio/')) {
        alert('Please drop an audio file (MP3 or WAV).');
        return;
      }
      onFileLoaded(file);
    },
    [onFileLoaded]
  );

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so same file can be re-uploaded
      e.target.value = '';
    },
    [processFile]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative flex flex-col items-center justify-center gap-3',
          'h-28 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none',
          isDragging
            ? 'border-cyan-400 bg-cyan-950/30 scale-[1.01]'
            : 'border-cyan-900/50 hover:border-cyan-600/70 bg-[#0d0d15]',
        ].join(' ')}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mp3,audio/mpeg,audio/wav,audio/*"
          className="hidden"
          onChange={handleInputChange}
        />

        {isLoading ? (
          <>
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-cyan-400">Decoding audio…</span>
          </>
        ) : fileName ? (
          <>
            {/* Music note icon */}
            <svg className="w-7 h-7 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
            <span className="text-sm text-cyan-300 font-medium truncate max-w-[90%] px-2">
              {fileName}
            </span>
            <span className="text-xs text-gray-500">Click or drag to replace</span>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <svg
              className={`w-8 h-8 transition-colors ${isDragging ? 'text-cyan-400' : 'text-gray-600'}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
            <div className="text-center">
              <p className={`text-sm font-medium ${isDragging ? 'text-cyan-300' : 'text-gray-400'}`}>
                {isDragging ? 'Drop it here!' : 'Drop MP3 / WAV here'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">or click to browse</p>
            </div>
          </>
        )}
      </div>

      {/* Waveform canvas */}
      {audioBuffer && (
        <div className="relative w-full h-20 rounded-lg overflow-hidden bg-[#0a0a0f] border border-cyan-900/20">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: 'block' }}
          />
          {/* Scanline overlay for cyberpunk feel */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
            }}
          />
          <span className="absolute bottom-1 right-2 text-[10px] text-gray-600 font-mono">
            WAVEFORM
          </span>
        </div>
      )}
    </div>
  );
};

export default UploadZone;
