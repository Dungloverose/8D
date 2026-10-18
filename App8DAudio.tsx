/**
 * App8DAudio — Main Application Shell
 *
 * Layout (desktop ≥ lg):
 * ┌──────────────────────────────┬─────────────────┐
 * │  Header                      │                 │
 * ├──────────────────────────────┤  Effects Panel  │
 * │  UploadZone + Waveform       │  (right column) │
 * ├──────────────────────────────┤                 │
 * │  3D Visualizer (Three.js)    │                 │
 * ├──────────────────────────────┤                 │
 * │  TransportBar                │                 │
 * └──────────────────────────────┴─────────────────┘
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { AudioSpatializer, SpatialPattern, createSpatializer } from './AudioSpatializer';
import { SpatialVisualizer } from './SpatialVisualizer';
import UploadZone from './UploadZone';
import EffectsPanel from './EffectsPanel';
import TransportBar from './TransportBar';

// ─── Initial parameter defaults ───────────────────────────────────────────────

const DEFAULTS = {
  speedHz:    0.25,   // 1 rotation per 4 seconds
  radius:     2,      // meters
  pattern:    'circle' as SpatialPattern,
  reverbWet:  0.3,
  volume:     1,
};

// ─── App ─────────────────────────────────────────────────────────────────────

const App8DAudio: React.FC = () => {
  // Spatializer instance — stable across renders
  const [spatializer] = useState<AudioSpatializer>(() =>
    createSpatializer({
      speed:     DEFAULTS.speedHz,
      radius:    DEFAULTS.radius,
      pattern:   DEFAULTS.pattern,
      reverbWet: DEFAULTS.reverbWet,
      volume:    DEFAULTS.volume,
    })
  );

  // Dispose on unmount
  useEffect(() => () => spatializer.dispose(), [spatializer]);

  // ── Audio file state ──
  const [isLoading,  setIsLoading]  = useState(false);
  const [fileName,   setFileName]   = useState('');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // ── Playback state ──
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);

  // ── Effect parameters ──
  const [speedHz,   setSpeedHz]   = useState(DEFAULTS.speedHz);
  const [radius,    setRadius]    = useState(DEFAULTS.radius);
  const [pattern,   setPattern]   = useState<SpatialPattern>(DEFAULTS.pattern);
  const [reverbWet, setReverbWet] = useState(DEFAULTS.reverbWet);
  const [volume,    setVolume]    = useState(DEFAULTS.volume);

  // ── Time ticker ──
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      if (spatializer.getIsPlaying()) {
        setCurrentTime(spatializer.getCurrentTime());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [spatializer]);

  // ─── File upload ─────────────────────────────────────────────────────────

  const handleFileLoaded = useCallback(
    async (file: File) => {
      // Stop current playback before swapping buffer
      if (spatializer.getIsPlaying()) {
        spatializer.stop();
        setIsPlaying(false);
        setCurrentTime(0);
      }

      setIsLoading(true);
      setFileName(file.name);

      try {
        await spatializer.loadFile(file);
        const buf = spatializer.getAudioBuffer();
        setAudioBuffer(buf);
        setDuration(spatializer.getDuration());
      } catch (err) {
        console.error('Audio load error:', err);
        alert('Could not decode the audio file. Try a different MP3 or WAV.');
        setFileName('');
        setAudioBuffer(null);
      } finally {
        setIsLoading(false);
      }
    },
    [spatializer]
  );

  // ─── Transport ───────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    spatializer.play();
    setIsPlaying(true);
  }, [spatializer]);

  const handlePause = useCallback(() => {
    spatializer.pause();
    setIsPlaying(false);
  }, [spatializer]);

  const handleReset = useCallback(() => {
    spatializer.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  }, [spatializer]);

  // ─── Effect parameter handlers ───────────────────────────────────────────

  const handleSpeedChange = useCallback(
    (hz: number) => {
      setSpeedHz(hz);
      spatializer.setSpeed(hz);
    },
    [spatializer]
  );

  const handleRadiusChange = useCallback(
    (r: number) => {
      setRadius(r);
      spatializer.setRadius(r);
    },
    [spatializer]
  );

  const handlePatternChange = useCallback(
    (p: SpatialPattern) => {
      setPattern(p);
      spatializer.setPattern(p);
    },
    [spatializer]
  );

  const handleReverbChange = useCallback(
    (wet: number) => {
      setReverbWet(wet);
      spatializer.setReverbWet(wet);
    },
    [spatializer]
  );

  const handleVolumeChange = useCallback(
    (v: number) => {
      setVolume(v);
      spatializer.setVolume(v);
    },
    [spatializer]
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans flex flex-col">

      {/* ── Header ── */}
      <header className="shrink-0 border-b border-cyan-900/30 px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3">
          {/* Logo */}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
            <span className="text-sm font-extrabold tracking-tighter">8D</span>
          </div>

          <div>
            <h1 className="text-lg font-bold leading-none bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Audio Spatializer
            </h1>
            <p className="text-[10px] text-gray-600 mt-0.5">
              3D Sound Experience · Web Audio API
            </p>
          </div>

          {/* Headphone tip  */}
          <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-gray-600">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h1a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H5v-2a7 7 0 0 1 14 0v2h-2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z" />
            </svg>
            Dùng tai nghe để trải nghiệm tốt nhất
          </div>
        </div>
      </header>

      {/* ── Main Grid ── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

        {/* ── Left column ── */}
        <div className="flex flex-col gap-4 min-w-0">

          {/* Upload zone */}
          <UploadZone
            onFileLoaded={handleFileLoaded}
            audioBuffer={audioBuffer}
            isLoading={isLoading}
            fileName={fileName}
          />

          {/* 3D Visualizer — grows to fill remaining space */}
          <div
            className="relative rounded-xl overflow-hidden border border-cyan-900/30 bg-[#0a0a0f]"
            style={{ minHeight: '320px', flex: '1 1 0' }}
          >
            {/* Three.js mounts here */}
            <SpatialVisualizer
              spatializer={spatializer}
              className="w-full h-full absolute inset-0"
            />

            {/* No-audio overlay */}
            {!audioBuffer && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <svg
                  className="w-12 h-12 text-gray-800"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                </svg>
                <p className="text-sm text-gray-700">
                  Tải file âm thanh để bắt đầu
                </p>
              </div>
            )}
          </div>

          {/* Transport bar */}
          <TransportBar
            isPlaying={isPlaying}
            hasAudio={!!audioBuffer}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            fileName={fileName}
            audioBuffer={audioBuffer}
            speedHz={speedHz}
            radius={radius}
            pattern={pattern}
            reverbWet={reverbWet}
            onPlay={handlePlay}
            onPause={handlePause}
            onReset={handleReset}
            onVolumeChange={handleVolumeChange}
          />
        </div>

        {/* ── Right column — Effects panel ── */}
        <aside className="lg:overflow-y-auto">
          {/* Sticky wrapper on desktop */}
          <div className="lg:sticky lg:top-5">
            <EffectsPanel
              speedHz={speedHz}
              radius={radius}
              pattern={pattern}
              reverbWet={reverbWet}
              onSpeedChange={handleSpeedChange}
              onRadiusChange={handleRadiusChange}
              onPatternChange={handlePatternChange}
              onReverbChange={handleReverbChange}
            />
          </div>
        </aside>
      </main>

      {/* ── Footer ── */}
      <footer className="shrink-0 border-t border-cyan-900/20 py-3 px-6">
        <p className="max-w-screen-xl mx-auto text-center text-[10px] text-gray-700">
          8D Audio Spatializer · Web Audio API (HRTF) · Three.js Visualizer
        </p>
      </footer>
    </div>
  );
};

export default App8DAudio;
