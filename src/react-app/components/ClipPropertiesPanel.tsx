import { useCallback, useState } from 'react';
import { Move, RotateCw, Crop, X, Zap, Volume2 } from 'lucide-react';
import type { TimelineClip, Asset } from '@/react-app/hooks/useProject';

interface ClipTransform {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  cropTop?: number;
  cropBottom?: number;
  cropLeft?: number;
  cropRight?: number;
}

interface ClipPropertiesPanelProps {
  clip: TimelineClip | null;
  asset: Asset | null;
  onUpdateTransform: (clipId: string, transform: ClipTransform) => void;
  onUpdateSpeed: (clipId: string, speed: number) => void;
  onUpdateVolume: (clipId: string, volume: number) => void;
  onClose: () => void;
}

// Speed: log scale, 1x at center (pos=50). Left: 0.1x→1x. Right: 1x→100x.
function speedToSlider(speed: number): number {
  const s = Math.max(0.1, Math.min(100, speed));
  if (s <= 1) return 50 * (Math.log10(s) + 1);
  return 50 + 25 * Math.log10(s);
}
function sliderToSpeed(pos: number): number {
  const p = Math.max(0, Math.min(100, pos));
  if (p <= 50) return Math.pow(10, p / 50 - 1);
  return Math.pow(10, (p - 50) / 25);
}

// Volume: bilinear, 1 (100%) at center (pos=50). Left: 0→1. Right: 1→10.
function volumeToSlider(vol: number): number {
  const v = Math.max(0, Math.min(10, vol));
  if (v <= 1) return v * 50;
  return 50 + (v - 1) / 9 * 50;
}
function sliderToVolume(pos: number): number {
  const p = Math.max(0, Math.min(100, pos));
  if (p <= 50) return p / 50;
  return 1 + (p - 50) / 50 * 9;
}

// Number input that doesn't jump while the user is mid-typing
function NumberInput({ value, min, max, step = 1, decimals = 0, onChange, className = '' }: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState<string | null>(null);
  const display = localValue ?? value.toFixed(decimals);

  return (
    <input
      type="number"
      value={display}
      min={min}
      max={max}
      step={step}
      onFocus={() => setLocalValue(value.toFixed(decimals))}
      onBlur={() => setLocalValue(null)}
      onChange={(e) => {
        setLocalValue(e.target.value);
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) {
          const clamped =
            min !== undefined && max !== undefined
              ? Math.max(min, Math.min(max, v))
              : v;
          onChange(clamped);
        }
      }}
      className={`w-16 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-white text-right ${className}`}
    />
  );
}

export default function ClipPropertiesPanel({
  clip,
  asset,
  onUpdateTransform,
  onUpdateSpeed,
  onUpdateVolume,
  onClose,
}: ClipPropertiesPanelProps) {
  if (!clip || !asset) {
    return (
      <div className="p-3 text-center text-zinc-500 text-xs">
        Select a clip to edit its properties
      </div>
    );
  }

  const transform = clip.transform || {};
  const speed = clip.speed ?? 1;
  const clipVolume = clip.volume ?? 1;

  const handleTransformChange = useCallback((updates: Partial<ClipTransform>) => {
    onUpdateTransform(clip.id, { ...transform, ...updates });
  }, [clip.id, clip.transform, onUpdateTransform]);

  const handleSpeedSlider = useCallback((pos: number) => {
    onUpdateSpeed(clip.id, sliderToSpeed(pos));
  }, [clip.id, onUpdateSpeed]);

  const handleSpeedValue = useCallback((val: number) => {
    onUpdateSpeed(clip.id, Math.max(0.1, Math.min(100, val)));
  }, [clip.id, onUpdateSpeed]);

  const handleVolumeSlider = useCallback((pos: number) => {
    onUpdateVolume(clip.id, sliderToVolume(pos));
  }, [clip.id, onUpdateVolume]);

  const handleVolumeValue = useCallback((val: number) => {
    onUpdateVolume(clip.id, Math.max(0, Math.min(10, val / 100)));
  }, [clip.id, onUpdateVolume]);

  const handleReset = useCallback(() => {
    onUpdateTransform(clip.id, {
      x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
      cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
    });
    onUpdateSpeed(clip.id, 1);
    onUpdateVolume(clip.id, 1);
  }, [clip.id, onUpdateTransform, onUpdateSpeed, onUpdateVolume]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50">
        <span className="text-xs font-medium text-zinc-400">Clip Properties</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-700 rounded transition-colors"
          title="Deselect clip"
        >
          <X className="w-3.5 h-3.5 text-zinc-500" />
        </button>
      </div>

      {/* Clip info */}
      <div className="px-3 py-2 border-b border-zinc-800/50">
        <div className="text-xs text-white font-medium truncate">{asset.filename}</div>
        <div className="text-[10px] text-zinc-500 mt-0.5">
          {asset.type} • {asset.width && asset.height ? `${asset.width}×${asset.height}` : 'N/A'}
        </div>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-auto p-3 space-y-4">

        {/* Speed */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Speed</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={speedToSlider(speed)}
              onChange={(e) => handleSpeedSlider(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <NumberInput
              value={speed}
              min={0.1}
              max={100}
              step={0.01}
              decimals={2}
              onChange={handleSpeedValue}
            />
            <span className="text-[10px] text-zinc-500">x</span>
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5 px-0.5">
            <span>0.1×</span><span>1×</span><span>100×</span>
          </div>
        </div>

        {/* Volume */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Volume</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={volumeToSlider(clipVolume)}
              onChange={(e) => handleVolumeSlider(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <NumberInput
              value={clipVolume * 100}
              min={0}
              max={1000}
              step={1}
              decimals={0}
              onChange={handleVolumeValue}
            />
            <span className="text-[10px] text-zinc-500">%</span>
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5 px-0.5">
            <span>0%</span><span>100%</span><span>1000%</span>
          </div>
        </div>

        {/* Scale */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Move className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Scale</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="10"
              max="300"
              step="5"
              value={(transform.scale ?? 1) * 100}
              onChange={(e) => handleTransformChange({ scale: parseFloat(e.target.value) / 100 })}
              className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <NumberInput
              value={(transform.scale ?? 1) * 100}
              min={10}
              max={300}
              step={5}
              decimals={0}
              onChange={(v) => handleTransformChange({ scale: v / 100 })}
            />
            <span className="text-[10px] text-zinc-500">%</span>
          </div>
        </div>

        {/* Rotation */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <RotateCw className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Rotation</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={transform.rotation ?? 0}
              onChange={(e) => handleTransformChange({ rotation: parseFloat(e.target.value) })}
              className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <NumberInput
              value={transform.rotation ?? 0}
              min={-180}
              max={180}
              step={1}
              decimals={0}
              onChange={(v) => handleTransformChange({ rotation: v })}
            />
            <span className="text-[10px] text-zinc-500">°</span>
          </div>
        </div>

        {/* Position */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Move className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Position</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">X</label>
              <input
                type="number"
                value={transform.x ?? 0}
                onChange={(e) => handleTransformChange({ x: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Y</label>
              <input
                type="number"
                value={transform.y ?? 0}
                onChange={(e) => handleTransformChange({ y: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* Crop */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Crop className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Crop</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['cropTop', 'cropBottom', 'cropLeft', 'cropRight'] as const).map((side) => (
              <div key={side}>
                <label className="text-[10px] text-zinc-500 mb-1 block capitalize">
                  {side.replace('crop', '')} %
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={transform[side] ?? 0}
                  onChange={(e) => handleTransformChange({ [side]: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-white"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reset button */}
      <div className="p-3 border-t border-zinc-800/50">
        <button
          onClick={handleReset}
          className="w-full px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-medium transition-colors"
        >
          Reset All
        </button>
      </div>
    </div>
  );
}
