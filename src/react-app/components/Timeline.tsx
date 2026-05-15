import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, Play, Pause, SkipBack, Scissors, Trash2, Type, RectangleHorizontal, RectangleVertical, Link, Unlink, Undo2, Redo2, Volume2, VolumeX } from 'lucide-react';
import TimelineClip from './TimelineClip';
import type { Track, TimelineClip as TimelineClipType, Asset, CaptionData } from '@/react-app/hooks/useProject';

interface TimelineProps {
  tracks: Track[];
  clips: TimelineClipType[];
  assets: Asset[];
  selectedClipIds: string[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  aspectRatio: '16:9' | '9:16' | 'auto';
  onSelectClip: (id: string | null, modifiers?: { multi: boolean; range: boolean }) => void;
  onSelectClips: (ids: string[], modifiers?: { multi: boolean }) => void;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onMoveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  onResizeClip: (clipId: string, newInPoint: number, newOutPoint: number, newStart?: number) => void;
  onDeleteClip: (clipId: string) => void;
  onCutAtPlayhead: () => void;
  onAddText: () => void;
  onToggleAspectRatio: () => void;
  autoSnap?: boolean;
  onToggleAutoSnap?: () => void;
  onDropAssets: (assets: Asset[], trackId: string, time: number) => void;
  onFinalizeMove: (clipId: string) => void;
  onSave: () => void;
  getCaptionData?: (clipId: string) => CaptionData | null;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onBeginDrag?: () => void;
  onCommitDrag?: () => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
}

const TRACK_HEIGHTS: Record<string, number> = {
  video: 56,
  audio: 44,
  text: 48,
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function Timeline({
  tracks,
  clips,
  assets,
  selectedClipIds,
  currentTime,
  duration,
  isPlaying,
  aspectRatio,
  onSelectClip,
  onSelectClips,
  onTimeChange,
  onPlayPause,
  onStop,
  onMoveClip,
  onResizeClip,
  onDeleteClip,
  onCutAtPlayhead,
  onAddText,
  onToggleAspectRatio,
  autoSnap = true,
  onToggleAutoSnap,
  onDropAssets,
  onFinalizeMove,
  onSave,
  getCaptionData,
  undo,
  redo,
  canUndo = false,
  canRedo = false,
  onBeginDrag,
  onCommitDrag,
  volume = 0.5,
  onVolumeChange,
}: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  const [dragOverTime, setDragOverTime] = useState<number | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [draggedClipInfo, setDraggedClipInfo] = useState<{
    id: string;
    originalTrackId: string;
    originalStart: number;
    duration: number;
    currentTrackId: string;
    currentStart: number;
    snapTime: number | null;
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const trackHeadersRef = useRef<HTMLDivElement>(null);
  // Stores initial clip positions for all selected clips when a multi-select drag/resize begins
  const multiDragInitialStates = useRef<Map<string, { start: number; inPoint: number; outPoint: number }> | null>(null);

  // Sync vertical scroll between track headers and tracks content
  useEffect(() => {
    const tracksContainer = tracksContainerRef.current;
    const trackHeaders = trackHeadersRef.current;
    if (!tracksContainer || !trackHeaders) return;

    const handleScroll = () => {
      trackHeaders.scrollTop = tracksContainer.scrollTop;
    };

    tracksContainer.addEventListener('scroll', handleScroll);
    return () => tracksContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected clips with Delete or Backspace key
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipIds.length > 0) {
        // Don't trigger if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();
        selectedClipIds.forEach(id => onDeleteClip(id));
      }

      // Select all clips with Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        onSelectClips(clips.map(c => c.id));
      }

      // Undo with Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        undo?.();
      }

      // Redo with Ctrl+Shift+Z or Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'Z') || e.key === 'y')) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        redo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipIds, onDeleteClip, clips, onSelectClips, undo, redo]);

  // Calculate display properties
  const totalDuration = Math.max(duration, 10);
  const basePixelsPerSecond = Math.min(100, 2000 / totalDuration);
  const pixelsPerSecond = basePixelsPerSecond * zoom;
  const timelineWidth = Math.max(totalDuration * pixelsPerSecond, 800);

  // Track header width
  const headerWidth = 48;

  // Time ruler intervals
  const getTimeInterval = useCallback(() => {
    const effectiveZoom = pixelsPerSecond / 50;
    if (effectiveZoom > 2) return 1;
    if (effectiveZoom > 1) return 5;
    if (effectiveZoom > 0.5) return 10;
    if (effectiveZoom > 0.2) return 30;
    return 60;
  }, [pixelsPerSecond]);

  const timeInterval = getTimeInterval();
  const tickCount = Math.ceil(totalDuration / timeInterval) + 1;

  // Sort tracks by order
  const sortedTracks = useMemo(() =>
    [...tracks].sort((a, b) => a.order - b.order),
    [tracks]
  );

  // Get clips for a specific track
  const getTrackClips = useCallback((trackId: string) =>
    clips.filter(c => c.trackId === trackId),
    [clips]
  );

  // Handle clicking on timeline to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!tracksContainerRef.current) return;

    const rect = tracksContainerRef.current.getBoundingClientRect();
    const scrollLeft = tracksContainerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(clickX / pixelsPerSecond, duration));

    onTimeChange(newTime);
    onSelectClip(null);
  }, [pixelsPerSecond, duration, onTimeChange, onSelectClip]);

  // Handle playhead dragging
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingPlayhead || !tracksContainerRef.current) return;

    const rect = tracksContainerRef.current.getBoundingClientRect();
    const scrollLeft = tracksContainerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(clickX / pixelsPerSecond, duration));

    onTimeChange(newTime);
  }, [isDraggingPlayhead, pixelsPerSecond, duration, onTimeChange]);

  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingPlayhead) {
      handleMouseMove(e);
      return;
    }

    if (selectionRect && tracksContainerRef.current) {
      const rect = tracksContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionRect(prev => prev ? { ...prev, x2: x, y2: y } : null);
    }
  }, [isDraggingPlayhead, handleMouseMove, selectionRect]);

  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection box if clicking on the background (not a clip, not playhead)
    if (e.button !== 0) return;
    if (!tracksContainerRef.current) return;

    const rect = tracksContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelectionRect({ x1: x, y1: y, x2: x, y2: y });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsDraggingPlayhead(false);

    if (selectionRect && tracksContainerRef.current) {
      // Find all clips that intersect with the selection box
      const scrollLeft = tracksContainerRef.current.scrollLeft;
      const scrollTop = tracksContainerRef.current.scrollTop;

      const selXMin = Math.min(selectionRect.x1, selectionRect.x2) + scrollLeft;
      const selXMax = Math.max(selectionRect.x1, selectionRect.x2) + scrollLeft;
      const selYMin = Math.min(selectionRect.y1, selectionRect.y2) + scrollTop;
      const selYMax = Math.max(selectionRect.y1, selectionRect.y2) + scrollTop;

      const selectedIds: string[] = [];
      let currentY = 24; // Account for 24px height of sticky time ruler

      sortedTracks.forEach(track => {
        const trackHeight = TRACK_HEIGHTS[track.type];
        const trackClips = clips.filter(c => c.trackId === track.id);

        trackClips.forEach(clip => {
          const clipLeft = clip.start * pixelsPerSecond;
          const clipRight = (clip.start + clip.duration) * pixelsPerSecond;
          const clipTop = currentY;
          const clipBottom = currentY + trackHeight;

          // Check for intersection
          const xOverlap = Math.max(0, Math.min(selXMax, clipRight) - Math.max(selXMin, clipLeft));
          const yOverlap = Math.max(0, Math.min(selYMax, clipBottom) - Math.max(selYMin, clipTop));

          if (xOverlap > 0 && yOverlap > 0) {
            selectedIds.push(clip.id);
          }
        });

        currentY += trackHeight;
      });

      if (selectedIds.length > 0) {
        onSelectClips(selectedIds, { multi: e.ctrlKey || e.metaKey });
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        onSelectClip(null);
      }
    }

    setSelectionRect(null);
  }, [selectionRect, sortedTracks, clips, pixelsPerSecond, onSelectClips, onSelectClip]);

  // Handle drop from asset library
  const handleDragOver = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrack(trackId);

    const rect = tracksContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scrollLeft = tracksContainerRef.current?.scrollLeft || 0;
    const dropX = e.clientX - rect.left + scrollLeft;
    let time = Math.max(0, dropX / pixelsPerSecond);

    // Magnetic Snapping for Library Drop
    const trackClips = clips.filter(c => c.trackId === trackId);
    let bestSnapDiff = 0.5; // Snap threshold
    let snappedTime = time;

    // Snap to 0 (beginning of timeline)
    if (time < bestSnapDiff) {
      snappedTime = 0;
      bestSnapDiff = time;
    }

    trackClips.forEach(c => {
      const cEnd = c.start + c.duration;
      if (Math.abs(time - cEnd) < bestSnapDiff) {
        snappedTime = cEnd;
        bestSnapDiff = Math.abs(time - cEnd);
      }
      if (Math.abs(time - c.start) < bestSnapDiff) {
        snappedTime = c.start;
        bestSnapDiff = Math.abs(time - c.start);
      }
    });

    setDragOverTime(Math.max(0, snappedTime));
  }, [pixelsPerSecond, clips]);

  const handleDragLeave = useCallback(() => {
    setDragOverTrack(null);
    setDragOverTime(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrack(null);
    setDragOverTime(null);

    // Prefer the new multi-asset payload, fallback to the old single-asset one
    const assetsData = e.dataTransfer.getData('application/x-hyperedit-assets');
    const legacyAssetData = e.dataTransfer.getData('application/x-hyperedit-asset');

    if (!assetsData && !legacyAssetData) return;

    try {
      let droppedAssets: Asset[] = [];
      if (assetsData) {
        droppedAssets = JSON.parse(assetsData) as Asset[];
      } else if (legacyAssetData) {
        droppedAssets = [JSON.parse(legacyAssetData) as Asset];
      }

      if (droppedAssets.length === 0) return;

      // Calculate drop time position
      const rect = tracksContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const scrollLeft = tracksContainerRef.current?.scrollLeft || 0;
      const dropX = e.clientX - rect.left + scrollLeft;
      const dropTime = Math.max(0, dropX / pixelsPerSecond);

      onDropAssets(droppedAssets, trackId, dragOverTime ?? dropTime);
    } catch (err) {
      console.error('Failed to parse dropped assets:', err);
    }
  }, [pixelsPerSecond, onDropAssets]);

  // Get asset for a clip
  const getAssetForClip = useCallback((clip: TimelineClipType) =>
    assets.find(a => a.id === clip.assetId),
    [assets]
  );

  return (
    <div
      ref={timelineRef}
      className="flex flex-col h-full select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Timeline header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/50">
        <div className="flex items-center gap-3">
          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={onStop}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              title="Stop (go to start)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onPlayPause}
              className={`p-1.5 rounded transition-colors ${isPlaying
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Editing tools */}
          <div className="flex items-center gap-1 border-l border-zinc-700 pl-3 ml-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:hover:bg-zinc-700 rounded transition-colors"
              title="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:hover:bg-zinc-700 rounded transition-colors"
              title="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-zinc-600 mx-1" />
            <button
              onClick={onCutAtPlayhead}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              title="Cut at playhead (split clip)"
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => selectedClipIds.forEach(id => onDeleteClip(id))}
              disabled={selectedClipIds.length === 0}
              className="p-1.5 bg-zinc-700 hover:bg-red-600 disabled:opacity-40 disabled:hover:bg-zinc-700 rounded transition-colors"
              title="Delete selected clips (Delete key)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onAddText}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              title="Add text overlay"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggleAspectRatio}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              title={`Currently ${aspectRatio === 'auto' ? 'Auto (Best Fit)' : aspectRatio === '16:9' ? '16:9 (Horizontal)' : '9:16 (Vertical)'} - click to override`}
            >
              {aspectRatio === '16:9' ? (
                <RectangleHorizontal className="w-3.5 h-3.5 text-orange-400" />
              ) : aspectRatio === '9:16' ? (
                <RectangleVertical className="w-3.5 h-3.5 text-orange-400" />
              ) : (
                <RectangleHorizontal className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>
            <div className="w-px h-4 bg-zinc-600" />
            <button
              onClick={onToggleAutoSnap}
              className={`p-1.5 rounded transition-colors ${autoSnap
                ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400'
                }`}
              title={autoSnap ? 'Auto-snap ON: Clips shift when deleting' : 'Auto-snap OFF: Gaps remain when deleting'}
            >
              {autoSnap ? (
                <Link className="w-3.5 h-3.5" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
            </button>

            <div className="w-px h-4 bg-zinc-600 mx-1" />

            {/* Volume Control */}
            <div className="flex items-center gap-2 px-2" title="Master Volume">
              {volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
                className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          </div>

          {/* Time display */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-orange-400">{formatTime(currentTime)}</span>
            <span className="text-zinc-600">/</span>
            <span className="font-mono text-zinc-400">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-zinc-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(zoom + 0.25)}
            className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track headers (fixed horizontally, syncs vertically) */}
        <div
          className="flex-shrink-0 bg-zinc-900/80 border-r border-zinc-700/50 flex flex-col"
          style={{ width: headerWidth }}
        >
          {/* Spacer for time ruler (sticky) */}
          <div className="h-6 border-b border-zinc-800 flex-shrink-0" />

          {/* Track labels (scrolls vertically with tracks) */}
          <div
            ref={trackHeadersRef}
            className="flex-1 overflow-hidden"
          >
            {sortedTracks.map(track => {
              const trackClipCount = clips.filter(c => c.trackId === track.id).length;
              const isTextTrack = track.type === 'text' && trackClipCount > 0;

              return (
                <div
                  key={track.id}
                  className="flex items-center justify-center gap-1 text-xs font-medium text-zinc-400 border-b border-zinc-800/50 px-1"
                  style={{ height: TRACK_HEIGHTS[track.type] }}
                >
                  <span className="truncate">{track.name}</span>
                  {isTextTrack && (
                    <button
                      title={`Delete all ${trackClipCount} captions`}
                      className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors flex-shrink-0"
                      onClick={() => {
                        if (confirm(`Delete all ${trackClipCount} captions on ${track.name}?`)) {
                          clips
                            .filter(c => c.trackId === track.id)
                            .forEach(c => onDeleteClip(c.id));
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable tracks area */}
        <div
          ref={tracksContainerRef}
          className="flex-1 overflow-auto relative"
          onMouseMove={handleContainerMouseMove}
          onMouseDown={handleContainerMouseDown}
        >
          {/* Marquee selection box */}
          {selectionRect && (
            <div
              className="absolute border border-orange-500/50 bg-orange-500/20 z-50 pointer-events-none"
              style={{
                left: Math.min(selectionRect.x1, selectionRect.x2),
                top: Math.min(selectionRect.y1, selectionRect.y2),
                width: Math.abs(selectionRect.x2 - selectionRect.x1),
                height: Math.abs(selectionRect.y2 - selectionRect.y1),
              }}
            />
          )}

          {/* Global Snap Line for clip drag */}
          {draggedClipInfo?.snapTime !== null && draggedClipInfo?.snapTime !== undefined && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-orange-500 z-50 pointer-events-none shadow-[0_0_8px_rgba(249,115,22,0.8)] transition-none"
              style={{ left: `${draggedClipInfo.snapTime * pixelsPerSecond}px` }}
            >
              <div className="absolute -top-4 -translate-x-1/2 bg-orange-600 text-white text-[10px] px-1 rounded whitespace-nowrap">
                Snap
              </div>
            </div>
          )}
          <div
            className="relative"
            style={{ width: timelineWidth, minHeight: '100%' }}
          >
            {/* Time ruler */}
            <div
              className="sticky top-0 h-6 bg-zinc-900/95 border-b border-zinc-800 z-30"
              onClick={handleTimelineClick}
            >
              {Array.from({ length: tickCount }).map((_, i) => {
                const time = i * timeInterval;
                if (time > totalDuration) return null;
                return (
                  <div
                    key={i}
                    className="absolute flex flex-col items-start"
                    style={{ left: `${time * pixelsPerSecond}px` }}
                  >
                    <span className="text-[10px] text-zinc-500 pl-1">{formatTime(time)}</span>
                    <div className="w-px h-2 bg-zinc-700" />
                  </div>
                );
              })}
            </div>

            {/* Tracks */}
            <div onClick={handleTimelineClick}>
              {sortedTracks.map(track => {
                const trackClips = getTrackClips(track.id);
                const isDragOver = dragOverTrack === track.id;

                return (
                  <div
                    key={track.id}
                    className={`relative border-b border-zinc-800/50 ${isDragOver ? 'bg-orange-500/10' : 'bg-zinc-900/30'
                      }`}
                    style={{ height: TRACK_HEIGHTS[track.type] }}
                    onDragOver={(e) => handleDragOver(e, track.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, track.id)}
                  >
                    {/* Track background grid lines */}
                    {Array.from({ length: tickCount }).map((_, i) => {
                      const time = i * timeInterval;
                      if (time > totalDuration) return null;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px bg-zinc-800/50"
                          style={{ left: `${time * pixelsPerSecond}px` }}
                        />
                      );
                    })}

                    {/* Empty track placeholder */}
                    {trackClips.length === 0 && !isDragOver && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600 pointer-events-none">
                        Drop clips here
                      </div>
                    )}

                    {/* Drop indicator background */}
                    {isDragOver && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-orange-400 pointer-events-none border-2 border-dashed border-orange-500/50 rounded">
                        Drop to add clip
                      </div>
                    )}

                    {/* Magnetic snap line indicator */}
                    {isDragOver && dragOverTime !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-orange-400 z-50 pointer-events-none shadow-[0_0_8px_rgba(249,115,22,0.8)] transition-all duration-75"
                        style={{ left: `${dragOverTime * pixelsPerSecond}px` }}
                      >
                        <div className="absolute -top-4 -translate-x-1/2 bg-orange-500 text-white text-[10px] px-1 rounded whitespace-nowrap">
                          Insert here
                        </div>
                      </div>
                    )}

                    {/* Clips */}
                    {trackClips.map(clip => {
                      const captionData = getCaptionData?.(clip.id);
                      const isCaption = track.type === 'text';
                      const captionPreview = captionData?.words
                        ? captionData.words.slice(0, 5).map(w => w.text).join(' ') + (captionData.words.length > 5 ? '...' : '')
                        : '';

                      // Gap logic: push subsequent clips on the target track to show where the clip will drop
                      let visualClip = clip;
                      if (draggedClipInfo && draggedClipInfo.id !== clip.id && track.id === draggedClipInfo.currentTrackId) {
                        // If this clip starts AT or AFTER the insertion point, push it right by the duration
                        if (clip.start >= draggedClipInfo.currentStart - 0.01) {
                          visualClip = { ...clip, start: clip.start + draggedClipInfo.duration };
                        }
                      }

                      return (
                        <TimelineClip
                          key={clip.id}
                          clip={visualClip}
                          asset={getAssetForClip(clip)}
                          pixelsPerSecond={pixelsPerSecond}
                          isSelected={selectedClipIds.includes(clip.id)}
                          trackHeight={TRACK_HEIGHTS[track.type]}
                          onClick={(modifiers) => onSelectClip(clip.id, modifiers)}
                          onDragStart={() => {
                            onBeginDrag?.();
                            // Capture initial positions of all selected clips for multi-select drag/resize
                            if (selectedClipIds.includes(clip.id) && selectedClipIds.length > 1) {
                              const initialStates = new Map<string, { start: number; inPoint: number; outPoint: number }>();
                              for (const selId of selectedClipIds) {
                                const selClip = clips.find(c => c.id === selId);
                                if (selClip) {
                                  initialStates.set(selId, { start: selClip.start, inPoint: selClip.inPoint, outPoint: selClip.outPoint });
                                }
                              }
                              multiDragInitialStates.current = initialStates;
                            } else {
                              multiDragInitialStates.current = null;
                            }
                            setDraggedClipInfo({
                              id: clip.id,
                              originalTrackId: track.id,
                              originalStart: clip.start,
                              duration: clip.duration,
                              currentTrackId: track.id,
                              currentStart: clip.start,
                              snapTime: null
                            });
                          }}
                          onDragProgress={(deltaX, _deltaY, _clientX, clientY) => {
                            setDraggedClipInfo(prev => {
                              if (!prev) return null;

                              let newStart = Math.max(0, prev.originalStart + (deltaX / pixelsPerSecond));

                              // Calculate target track using DOM
                              let targetTrackId = prev.currentTrackId;
                              if (tracksContainerRef.current) {
                                const rect = tracksContainerRef.current.getBoundingClientRect();
                                const scrollTop = tracksContainerRef.current.scrollTop;
                                // 24px is the sticky time ruler height
                                const yRelative = clientY - rect.top + scrollTop - 24;

                                let accumulatedHeight = 0;
                                for (const t of sortedTracks) {
                                  const h = TRACK_HEIGHTS[t.type];
                                  if (yRelative >= accumulatedHeight && yRelative <= accumulatedHeight + h) {
                                    targetTrackId = t.id;
                                    break;
                                  }
                                  accumulatedHeight += h;
                                }
                              }

                              // Calculate global snap
                              let bestSnapTime: number | null = null;
                              if (autoSnap) {
                                let bestDiff = 0.5; // Snap threshold
                                const clipEnd = newStart + prev.duration;

                                clips.forEach(c => {
                                  if (c.id === prev.id) return;

                                  // Check start edge
                                  if (Math.abs(newStart - c.start) < bestDiff) {
                                    bestSnapTime = c.start;
                                    newStart = c.start;
                                    bestDiff = Math.abs(newStart - c.start);
                                  } else if (Math.abs(clipEnd - c.start) < bestDiff) {
                                    bestSnapTime = c.start;
                                    newStart = c.start - prev.duration;
                                    bestDiff = Math.abs(clipEnd - c.start);
                                  }

                                  // Check end edge
                                  const cEnd = c.start + c.duration;
                                  if (Math.abs(newStart - cEnd) < bestDiff) {
                                    bestSnapTime = cEnd;
                                    newStart = cEnd;
                                    bestDiff = Math.abs(newStart - cEnd);
                                  } else if (Math.abs(clipEnd - cEnd) < bestDiff) {
                                    bestSnapTime = cEnd;
                                    newStart = cEnd - prev.duration;
                                    bestDiff = Math.abs(clipEnd - cEnd);
                                  }
                                });
                              }

                              return {
                                ...prev,
                                currentStart: newStart,
                                currentTrackId: targetTrackId,
                                snapTime: bestSnapTime
                              };
                            });
                          }}
                          onDragEnd={() => {
                            setDraggedClipInfo(prev => {
                              if (prev) {
                                const initialStates = multiDragInitialStates.current;
                                if (initialStates && selectedClipIds.includes(prev.id) && selectedClipIds.length > 1) {
                                  const delta = prev.currentStart - prev.originalStart;
                                  for (const selId of selectedClipIds) {
                                    const initial = initialStates.get(selId);
                                    if (!initial) continue;
                                    const newStart = Math.max(0, initial.start + delta);
                                    onMoveClip(selId, newStart, selId === prev.id ? prev.currentTrackId : undefined);
                                    onFinalizeMove(selId);
                                  }
                                } else {
                                  onMoveClip(prev.id, prev.currentStart, prev.currentTrackId);
                                  onFinalizeMove(prev.id);
                                }
                                onSave();
                              }
                              return null;
                            });
                            onCommitDrag?.();
                          }}
                          onResize={(inPoint, outPoint, newStart) => {
                            const initialStates = multiDragInitialStates.current;
                            if (initialStates && selectedClipIds.includes(clip.id) && selectedClipIds.length > 1) {
                              const primary = initialStates.get(clip.id);
                              if (primary) {
                                const deltaIn = inPoint - primary.inPoint;
                                const deltaOut = outPoint - primary.outPoint;
                                for (const selId of selectedClipIds) {
                                  const initial = initialStates.get(selId);
                                  if (!initial) continue;
                                  const newSelIn = Math.max(0, initial.inPoint + deltaIn);
                                  const newSelOut = initial.outPoint + deltaOut;
                                  const newSelStart = newStart !== undefined ? Math.max(0, initial.start + deltaIn) : undefined;
                                  onResizeClip(selId, newSelIn, newSelOut, newSelStart);
                                }
                              }
                            } else {
                              onResizeClip(clip.id, inPoint, outPoint, newStart);
                            }
                          }}
                          onDelete={() => onDeleteClip(clip.id)}
                          isCaption={isCaption}
                          captionPreview={captionPreview}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-40 pointer-events-none"
              style={{ left: `${currentTime * pixelsPerSecond}px` }}
            >
              {/* Playhead handle */}
              <div
                className="absolute -top-0 -left-2.5 w-5 h-5 cursor-ew-resize pointer-events-auto"
                onMouseDown={handlePlayheadMouseDown}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-orange-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
