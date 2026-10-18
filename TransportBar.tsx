/**
 * TransportBar Component
 * Play / Pause / Reset controls + progress bar + time display + Export 8D Audio
 */

import React, { useCallback, useState } from 'react';
import { export8DAudio, downloadBlob, generateExportFilename, ExportProgress } from './AudioExporter';
import { SpatialPattern } from './AudioSpatializer';

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlayIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const ResetIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
  </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TransportBarProps {
  isPlaying: boolean;
  hasAudio: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  fileName: string;
  audioBuffer: AudioBuffer | null;
  // Effect params for export
  speedHz: number;
  radius: number;
  pattern: SpatialPattern;
  reverbWet: number;
  // Handlers
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onVolumeChange: (v: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  hasAudio,
  currentTime,
  duration,
  volume,
  fileName,
  audioBuffer,
  speedHz,
  radius,
  pattern,
  reverbWet,
  onPlay,
  onPause,
  onReset,
  onVolumeChange,
}) => {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) onPause();
    else onPlay();
  }, [isPlaying, onPlay, onPause]);

  // ─── Export Handler ─────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!audioBuffer || isExporting) return;

    setIsExporting(true);
    setExportProgress({ percent: 0, phase: 'preparing' });

    try {
      const wavBlob = await export8DAudio(
        audioBuffer,
        {
          speed: speedHz,
          radius,
          pattern,
          reverbWet,
          volume,
        },
        (p) => setExportProgress(p)
      );

      // Download the file
      const exportName = generateExportFilename(fileName || 'audio');
      downloadBlob(wavBlob, exportName);

    } catch (err) {
      console.error('Export failed:', err);
      alert('Không thể xuất file âm thanh. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [audioBuffer, isExporting, speedHz, radius, pattern, reverbWet, volume, fileName]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 rounded-xl bg-[#0d0d18] border border-cyan-900/30 flex flex-col gap-3">
      {/* Row 1 — Buttons + file info + volume */}
      <div className="flex items-center gap-3">

        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          disabled={!hasAudio || isExporting}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={[
            'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0d18]',
            hasAudio && !isExporting
              ? 'bg-gradient-to-br from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 focus:ring-purple-500 shadow-lg shadow-purple-900/40'
              : 'bg-gray-800 cursor-not-allowed opacity-40',
          ].join(' ')}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Reset / Stop */}
        <button
          onClick={onReset}
          disabled={!hasAudio || isExporting}
          aria-label="Reset position"
          title="Stop & reset position"
          className={[
            'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0d18] focus:ring-gray-500',
            hasAudio && !isExporting
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              : 'bg-gray-900 cursor-not-allowed opacity-40 text-gray-600',
          ].join(' ')}
        >
          <ResetIcon className="w-4 h-4" />
        </button>

        {/* File name + time */}
        <div className="flex-1 min-w-0">
          {fileName ? (
            <p className="text-xs text-cyan-300 truncate font-medium">{fileName}</p>
          ) : (
            <p className="text-xs text-gray-600 italic">Chưa tải file...</p>
          )}
          <p className="text-[11px] font-mono text-gray-500 mt-0.5">
            {formatTime(currentTime)}
            <span className="text-gray-700"> / </span>
            {formatTime(duration)}
          </p>
        </div>

        {/* Export 8D Audio Button */}
        <button
          onClick={handleExport}
          disabled={!hasAudio || isExporting}
          aria-label="Export 8D Audio"
          title="Export 8D Audio as WAV"
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0d18]',
            hasAudio && !isExporting
              ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white focus:ring-emerald-500 shadow-lg shadow-emerald-900/30'
              : 'bg-gray-800 cursor-not-allowed opacity-40 text-gray-500',
          ].join(' ')}
        >
          <DownloadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Export 8D</span>
        </button>

        {/* Volume knob */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Speaker icon */}
          <svg
            className="w-4 h-4 text-gray-500 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            {volume === 0 ? (
              <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97V9.77l2.45 2.45c.03-.2.05-.41.05-.62zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.54 1.54L20.54 18 5.27 2.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            ) : volume < 0.5 ? (
              <path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
            ) : (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            )}
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 h-1.5 rounded-full appearance-none cursor-pointer bg-gray-800 accent-purple-500"
          />
          <span className="text-[10px] font-mono text-gray-600 w-7 text-right">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      {/* Row 2 — Progress bar */}
      <div className="relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-400 rounded-full transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
        {/* Playhead dot */}
        {duration > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow shadow-purple-500/50 -ml-1.5 transition-all duration-100"
            style={{ left: `${progress}%` }}
          />
        )}
      </div>

      {/* Row 3 — Export Progress Bar (only when exporting) */}
      {isExporting && exportProgress && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              {/* Spinner */}
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {exportProgress.phase === 'preparing' && 'Đang chuẩn bị...'}
              {exportProgress.phase === 'rendering' && 'Đang render 8D audio...'}
              {exportProgress.phase === 'encoding' && 'Đang mã hóa WAV...'}
              {exportProgress.phase === 'complete' && 'Hoàn tất!'}
            </span>
            <span className="text-emerald-300 font-mono">
              {exportProgress.percent.toFixed(0)}%
            </span>
          </div>
          {/* Progress bar */}
          <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-200"
              style={{ width: `${exportProgress.percent}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 text-center">
            Rendering offline với OfflineAudioContext (không cần phát hết bài)
          </p>
        </div>
      )}

      {/* Row 4 — Playback status badge */}
      <div className="flex items-center gap-1.5">
        <span
          className={[
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono',
            isPlaying
              ? 'bg-cyan-900/40 text-cyan-400'
              : 'bg-gray-900 text-gray-600',
          ].join(' ')}
        >
          {isPlaying && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          )}
          {isPlaying ? 'PLAYING' : hasAudio ? 'PAUSED' : 'NO AUDIO'}
        </span>
      </div>
    </div>
  );
};

export default TransportBar;
