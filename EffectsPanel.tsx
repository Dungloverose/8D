/**
 * EffectsPanel Component
 * 8D audio effect controls: speed, radius, orbit pattern, reverb
 */

import React from 'react';
import { SpatialPattern } from './AudioSpatializer';

// ─── Reusable sub-components ──────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  accentClass: string; // Tailwind accent-* class
  leftHint?: string;
  rightHint?: string;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  display,
  accentClass,
  leftHint,
  rightHint,
  onChange,
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold tracking-wide text-cyan-400 uppercase">
        {label}
      </span>
      <span className="text-xs font-mono text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded">
        {display}
      </span>
    </div>

    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-800 ${accentClass}`}
    />

    {(leftHint || rightHint) && (
      <div className="flex justify-between text-[10px] text-gray-600">
        {leftHint && <span>{leftHint}</span>}
        {rightHint && <span>{rightHint}</span>}
      </div>
    )}
  </div>
);

// ─── Pattern option data ───────────────────────────────────────────────────────

interface PatternOption {
  id: SpatialPattern;
  label: string;
  emoji: string;
  hint: string;
}

const PATTERN_OPTIONS: PatternOption[] = [
  { id: 'circle',  label: 'Tròn 360°',   emoji: '⭕', hint: 'Quỹ đạo tròn đều quanh đầu' },
  { id: 'figure8', label: 'Hình số 8',   emoji: '∞',  hint: 'Lissajous 3D' },
  { id: 'bounce',  label: 'Trái / Phải', emoji: '↔',  hint: 'Qua lại stereo' },
];

// ─── Speed helper: convert Hz ↔ seconds-per-cycle ────────────────────────────

/** speed in Hz → seconds per cycle */
const hzToPeriod = (hz: number) => (hz > 0 ? 1 / hz : Infinity);

/** seconds per cycle → Hz */
const periodToHz = (s: number) => (s > 0 ? 1 / s : 0);

// Speed slider works in seconds-per-cycle (period) for user friendliness
// Range: 0.1 s (very fast) → 20 s (very slow)

// ─── Main component ───────────────────────────────────────────────────────────

interface EffectsPanelProps {
  /** Current speed in Hz (from AudioSpatializer) */
  speedHz: number;
  radius: number;
  pattern: SpatialPattern;
  reverbWet: number;
  onSpeedChange: (hz: number) => void;
  onRadiusChange: (r: number) => void;
  onPatternChange: (p: SpatialPattern) => void;
  onReverbChange: (wet: number) => void;
}

const EffectsPanel: React.FC<EffectsPanelProps> = ({
  speedHz,
  radius,
  pattern,
  reverbWet,
  onSpeedChange,
  onRadiusChange,
  onPatternChange,
  onReverbChange,
}) => {
  // Expose period (seconds/cycle) to the slider; convert back on change
  const period = hzToPeriod(speedHz);

  const handlePeriodChange = (s: number) => {
    onSpeedChange(periodToHz(s));
  };

  return (
    <section
      aria-label="8D Effects Panel"
      className="flex flex-col gap-4"
    >
      {/* ── Panel title ── */}
      <div className="flex items-center gap-2 pb-1 border-b border-cyan-900/30">
        <span className="text-base font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          8D Effects
        </span>
        <span className="text-[10px] font-mono text-gray-600 ml-auto">SPATIAL ENGINE</span>
      </div>

      {/* ── Rotation Speed ── */}
      <div className="p-3 rounded-xl bg-[#0d0d18] border border-cyan-900/20">
        <SliderRow
          label="Rotation Speed"
          value={period}
          min={0.1}
          max={20}
          step={0.1}
          display={
            period < 1
              ? `${(period * 1000).toFixed(0)} ms/rev`
              : `${period.toFixed(1)} s/rev`
          }
          accentClass="accent-purple-500"
          leftHint="0.1 s (nhanh)"
          rightHint="20 s (chậm)"
          onChange={handlePeriodChange}
        />
      </div>

      {/* ── Radius ── */}
      <div className="p-3 rounded-xl bg-[#0d0d18] border border-cyan-900/20">
        <SliderRow
          label="Sound Distance"
          value={radius}
          min={0.5}
          max={8}
          step={0.1}
          display={`${radius.toFixed(1)} m`}
          accentClass="accent-cyan-500"
          leftHint="Gần"
          rightHint="Xa"
          onChange={onRadiusChange}
        />
        {/* Visual radius meter */}
        <div className="mt-2 relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-150"
            style={{ width: `${((radius - 0.5) / 7.5) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Orbit Pattern ── */}
      <div className="p-3 rounded-xl bg-[#0d0d18] border border-cyan-900/20">
        <span className="text-xs font-semibold tracking-wide text-cyan-400 uppercase block mb-2">
          Orbit Pattern
        </span>

        {/* Dropdown */}
        <select
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value as SpatialPattern)}
          className={[
            'w-full px-3 py-2 rounded-lg text-sm cursor-pointer',
            'bg-gray-900 border border-cyan-900/40 text-white',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500/50',
            'appearance-none',
          ].join(' ')}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2300bcd4'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.75rem center',
            backgroundSize: '1rem',
          }}
        >
          {PATTERN_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.emoji}  {opt.label}
            </option>
          ))}
        </select>

        {/* Pattern description */}
        <p className="mt-1.5 text-[10px] text-gray-500">
          {PATTERN_OPTIONS.find((o) => o.id === pattern)?.hint}
        </p>

        {/* Quick-pick buttons */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {PATTERN_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onPatternChange(opt.id)}
              className={[
                'py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                pattern === opt.id
                  ? 'bg-purple-700 text-white ring-1 ring-purple-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
              ].join(' ')}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Room Reverb / Spatial Depth ── */}
      <div className="p-3 rounded-xl bg-[#0d0d18] border border-cyan-900/20">
        <SliderRow
          label="Room Reverb"
          value={reverbWet}
          min={0}
          max={1}
          step={0.01}
          display={`${(reverbWet * 100).toFixed(0)}%`}
          accentClass="accent-cyan-400"
          leftHint="Dry (không gian)"
          rightHint="Wet (phòng lớn)"
          onChange={onReverbChange}
        />

        {/* Reverb visualizer: 5 bars */}
        <div className="mt-2 flex items-end gap-0.5 h-4">
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
            <div
              key={i}
              className={[
                'flex-1 rounded-sm transition-all duration-150',
                reverbWet >= threshold ? 'bg-cyan-500' : 'bg-gray-800',
              ].join(' ')}
              style={{ height: `${40 + i * 15}%` }}
            />
          ))}
        </div>
      </div>

      {/* ── Usage tip ── */}
      <div className="px-3 py-2 rounded-lg bg-purple-950/20 border border-purple-900/20 text-[10px] text-gray-500 leading-relaxed">
        🎧 Dùng tai nghe để trải nghiệm hiệu ứng 8D đầy đủ. Kéo quả cầu trong
        visualizer để thay đổi vị trí âm thanh thủ công.
      </div>
    </section>
  );
};

export default EffectsPanel;
