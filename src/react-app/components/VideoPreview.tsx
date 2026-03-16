import { Play, Image as ImageIcon, Layers, Move } from 'lucide-react';
import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useState, useCallback } from 'react';
import CaptionRenderer from './CaptionRenderer';
import type { CaptionWord, CaptionStyle } from '@/react-app/hooks/useProject';

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

interface ClipLayer {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio' | 'caption';
  trackId: string;
  clipTime: number;
  width?: number;
  height?: number;
  transform?: ClipTransform;
  // Caption-specific data
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
}

interface VideoPreviewProps {
  layers?: ClipLayer[];
  isPlaying?: boolean;
  aspectRatio?: '16:9' | '9:16' | 'auto';
  volume?: number;
  onLayerMove?: (layerId: string, x: number, y: number) => void;
  onLayerSelect?: (layerId: string) => void;
  onCaptionEdit?: (layerId: string, newText: string) => void;
  onCaptionBoxResize?: (layerId: string, newWidth: number) => void;
  selectedLayerId?: string | null;
}

export interface VideoPreviewHandle {
  seekTo: (time: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
}

// Helper to build CSS styles from transform
function getTransformStyles(transform?: ClipTransform, zIndex: number = 0, isDragging?: boolean): React.CSSProperties {
  const t = transform || {};

  const transforms: string[] = [];

  // Position (translate)
  if (t.x || t.y) {
    transforms.push(`translate(${t.x || 0}px, ${t.y || 0}px)`);
  }

  // Scale
  if (t.scale && t.scale !== 1) {
    transforms.push(`scale(${t.scale})`);
  }

  // Rotation
  if (t.rotation) {
    transforms.push(`rotate(${t.rotation}deg)`);
  }

  // Crop using clip-path
  const cropTop = t.cropTop || 0;
  const cropBottom = t.cropBottom || 0;
  const cropLeft = t.cropLeft || 0;
  const cropRight = t.cropRight || 0;
  const hasClip = cropTop || cropBottom || cropLeft || cropRight;

  return {
    zIndex,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    opacity: t.opacity ?? 1,
    clipPath: hasClip
      ? `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)`
      : undefined,
    cursor: isDragging ? 'grabbing' : undefined,
  };
}

const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(({
  layers = [],
  isPlaying = false,
  aspectRatio = 'auto',
  volume = 0.5,
  onLayerMove,
  onLayerSelect,
  onCaptionEdit,
  onCaptionBoxResize,
  selectedLayerId,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const overlayVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingLayer, setDraggingLayer] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; layerX: number; layerY: number } | null>(null);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [resizingCaption, setResizingCaption] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; boxWidth: number; containerWidth: number } | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const prevBaseLayerIdRef = useRef<string | undefined>(undefined);
  const [alignGuides, setAlignGuides] = useState<{ h: boolean; v: boolean }>({ h: false, v: false });

  // Find the base video layer (V1) for audio/playback control
  const foundBaseLayer = layers.find(l => l.trackId === 'V1' && l.type === 'video');
  const baseLayerId = foundBaseLayer?.id;
  const baseLayerUrl = foundBaseLayer?.url;
  const baseLayerClipTime = foundBaseLayer?.clipTime;

  // Memoize to prevent effect triggers when only caption layers change
  const baseVideoLayer = useMemo(() => {
    return foundBaseLayer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLayerId, baseLayerUrl]);

  // Get all layers sorted by track for rendering (V1 at bottom, then V2/V3, then T1 captions on top)
  const sortedLayers = useMemo(() => {
    const getTrackOrder = (trackId: string) => {
      if (trackId === 'V1') return 0;
      if (trackId === 'V2') return 1;
      if (trackId === 'V3') return 2;
      if (trackId.startsWith('T')) return 10; // Text/caption tracks on top
      return 5; // Other tracks in between
    };
    return [...layers].sort((a, b) => getTrackOrder(a.trackId) - getTrackOrder(b.trackId));
  }, [layers]);

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) videoRef.current.currentTime = time;
    },
    getVideoElement: () => videoRef.current,
  }));

  // Reload video when source URL changes (e.g., after dead air removal)
  // Using stable key + manual load() preserves the audio permission from user gesture
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !baseLayerUrl) return;
    if (loadedSrcRef.current !== baseLayerUrl) {
      if (loadedSrcRef.current) {
        console.log('[VideoPreview] Source changed, reloading video with audio');
        console.log('[VideoPreview] Old:', loadedSrcRef.current?.slice(-60));
        console.log('[VideoPreview] New:', baseLayerUrl.slice(-60));
      }
      video.src = baseLayerUrl;
      video.load();
      loadedSrcRef.current = baseLayerUrl;
    }
  }, [baseLayerUrl]);

  // Master Volume control for base video
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
    }
  }, [volume]);

  // Seek control for base video (only when paused/scrubbing)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || baseLayerClipTime === undefined) return;
    if (isPlaying) return;

    if (Math.abs(video.currentTime - baseLayerClipTime) > 0.1) {
      video.currentTime = baseLayerClipTime;
    }
  }, [baseLayerClipTime, isPlaying]);

  // Handle clip boundary transitions during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPlaying) {
      prevBaseLayerIdRef.current = baseLayerId;
      return;
    }

    if (prevBaseLayerIdRef.current !== undefined && prevBaseLayerIdRef.current !== baseLayerId) {
      if (baseLayerClipTime !== undefined) {
        video.currentTime = baseLayerClipTime;
      }
      if (video.paused) {
        video.play().catch(() => {});
      }
    }

    prevBaseLayerIdRef.current = baseLayerId;
  }, [baseLayerId, baseLayerClipTime, isPlaying]);

  // Play/pause control for base video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      console.log('[VideoPreview] Playing base video:', { src: video.src?.slice(-60), muted: video.muted, volume: video.volume, readyState: video.readyState, networkState: video.networkState });
      video.play().catch((err) => {
        console.error('[VideoPreview] Play failed:', err.name, err.message);
      });
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Play/pause and Volume control for overlay videos (V2, V3, etc.)
  useEffect(() => {
    overlayVideoRefs.current.forEach((video) => {
      video.volume = volume;
      if (isPlaying) {
        video.play().catch(() => { });
      } else {
        video.pause();
      }
    });
  }, [isPlaying, volume]);

  // Sync overlay video and audio seeking when scrubbing
  useEffect(() => {
    if (isPlaying) return; // Don't interfere during playback

    // Find overlay video and audio layers and sync their time
    const overlayMediaLayers = layers.filter(
      l => (l.type === 'video' && l.trackId !== 'V1') || l.type === 'audio'
    );

    overlayMediaLayers.forEach((layer) => {
      const mediaEl = overlayVideoRefs.current.get(layer.id);
      if (mediaEl && layer.clipTime !== undefined) {
        if (Math.abs(mediaEl.currentTime - layer.clipTime) > 0.1) {
          mediaEl.currentTime = layer.clipTime;
        }
      }
    });
  }, [layers, isPlaying]);

  // Seek on load (and resume playback if source changed mid-play)
  const handleLoaded = () => {
    if (videoRef.current && baseLayerClipTime !== undefined) {
      videoRef.current.currentTime = baseLayerClipTime;
    }
    if (isPlaying && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Handle mouse down on draggable layer
  const handleLayerMouseDown = useCallback((e: React.MouseEvent, layer: ClipLayer) => {
    // Only allow dragging non-V1 layers (overlays)
    if (layer.trackId === 'V1') return;
    if (e.button !== 0) return;
    // Don't start drag if we're editing text
    if (editingCaptionId === layer.id) return;

    e.preventDefault();
    e.stopPropagation();

    setDraggingLayer(layer.id);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      layerX: layer.transform?.x || 0,
      layerY: layer.transform?.y || 0,
    });

    // Select this layer
    onLayerSelect?.(layer.id);
  }, [onLayerSelect, editingCaptionId]);

  // Handle double-click on caption layer to enter edit mode
  const handleCaptionDoubleClick = useCallback((e: React.MouseEvent, layer: ClipLayer) => {
    e.preventDefault();
    e.stopPropagation();
    const text = layer.captionWords?.map(w => w.text).join(' ') || '';
    setEditingCaptionId(layer.id);
    setEditingText(text);
    onLayerSelect?.(layer.id);
    // Focus the input after render
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, [onLayerSelect]);

  // Commit caption edit
  const commitCaptionEdit = useCallback(() => {
    if (editingCaptionId && editingText.trim()) {
      onCaptionEdit?.(editingCaptionId, editingText.trim());
    }
    setEditingCaptionId(null);
    setEditingText('');
  }, [editingCaptionId, editingText, onCaptionEdit]);

  // Handle resize start on caption corner handle
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, layer: ClipLayer) => {
    e.preventDefault();
    e.stopPropagation();
    const cw = containerRef.current?.clientWidth || 600;
    setResizingCaption(layer.id);
    setResizeStart({
      x: e.clientX,
      boxWidth: layer.captionStyle?.boxWidth || 90,
      containerWidth: cw,
    });
    onLayerSelect?.(layer.id);
  }, [onLayerSelect]);

  // Handle resize mouse move — horizontal drag changes box width %
  useEffect(() => {
    if (!resizingCaption || !resizeStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Convert pixel delta to percentage of container width
      // Multiply by 2 because the box is centered (drag on right edge grows both sides)
      const deltaX = e.clientX - resizeStart.x;
      const deltaPct = (deltaX / resizeStart.containerWidth) * 200;
      const newWidth = Math.max(10, Math.min(100, resizeStart.boxWidth + deltaPct));
      onCaptionBoxResize?.(resizingCaption, Math.round(newWidth));
    };

    const handleMouseUp = () => {
      setResizingCaption(null);
      setResizeStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCaption, resizeStart, onCaptionBoxResize]);

  // Handle mouse move for dragging
  const SNAP_THRESHOLD = 6; // pixels — snap to center when within this distance
  useEffect(() => {
    if (!draggingLayer || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      let newX = dragStart.layerX + deltaX;
      let newY = dragStart.layerY + deltaY;

      // Snap vertical guide: x=0 means horizontally centered
      const snapV = Math.abs(newX) < SNAP_THRESHOLD;
      if (snapV) newX = 0;

      // Snap horizontal guide: measure actual element center vs container center
      let snapH = false;
      const container = containerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        // Find the dragged element inside the container
        const draggedEl = container.querySelector(`[data-layer-id="${draggingLayer}"]`) as HTMLElement;
        if (draggedEl) {
          const elRect = draggedEl.getBoundingClientRect();
          const elCenterY = elRect.top + elRect.height / 2;
          const containerCenterY = containerRect.top + containerRect.height / 2;
          const distFromCenter = elCenterY - containerCenterY;

          if (Math.abs(distFromCenter) < SNAP_THRESHOLD) {
            // Snap: adjust newY so element center lands exactly on container center
            newY = newY - distFromCenter;
            snapH = true;
          }
        }
      }

      setAlignGuides({ h: snapH, v: snapV });
      onLayerMove?.(draggingLayer, newX, newY);
    };

    const handleMouseUp = () => {
      setDraggingLayer(null);
      setDragStart(null);
      setAlignGuides({ h: false, v: false });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingLayer, dragStart, onLayerMove]);

  // Aspect ratio styles
  // Use object-contain to show full video without cropping
  const videoFitClass = 'object-contain';

  // Determine dynamic aspect ratio from base video layer
  const dynamicRatioString = (foundBaseLayer?.width && foundBaseLayer?.height)
    ? `${foundBaseLayer.width}/${foundBaseLayer.height}`
    : undefined;

  const isVertical = aspectRatio === '9:16';

  // Container styling — always constrain to parent via max-w/max-h so the
  // preview auto-fits the available space regardless of aspect ratio.
  const containerStyle: React.CSSProperties = {};
  let containerClass = 'relative bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 max-w-full max-h-full ';

  if (aspectRatio === 'auto') {
    if (dynamicRatioString) {
      containerStyle.aspectRatio = dynamicRatioString;
    } else {
      containerClass += 'aspect-video'; // fallback
    }
  } else if (isVertical) {
    containerClass += 'aspect-[9/16]';
  } else {
    containerClass += 'aspect-video';
  }

  // Let the aspect ratio + max constraints determine size: use h-full so the
  // container grows to fill available height, then aspect ratio sets width (or vice-versa).
  containerClass += ' h-full w-auto';

  if (layers.length === 0) {
    return (
      <div className={`${containerClass} flex items-center justify-center`} style={containerStyle}>
        <div className="text-center text-zinc-600">
          <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No media to display</p>
        </div>
      </div>
    );
  }

  // Separate base video from overlay layers to prevent re-render issues
  const overlayLayers = useMemo(() =>
    sortedLayers.filter(l => !(l.trackId === 'V1' && l.type === 'video')),
    [sortedLayers]
  );

  return (
    <div
      ref={containerRef}
      className={containerClass}
      style={containerStyle}
    >
      {/* Base video layer (V1) - rendered separately for stability */}
      {foundBaseLayer && (
        <video
          key="base-video"
          ref={videoRef}
          src={foundBaseLayer.url}
          className={`absolute inset-0 w-full h-full ${videoFitClass}`}
          style={{ zIndex: 1 }}
          playsInline
          preload="auto"
          onLoadedData={handleLoaded}
        />
      )}

      {/* Render overlay layers (V2+, images, captions) */}
      {overlayLayers.map((layer, index) => {
        const isOverlay = layer.trackId !== 'V1';
        const isDragging = draggingLayer === layer.id;
        const isSelected = selectedLayerId === layer.id;
        const styles = getTransformStyles(layer.transform, index + 2, isDragging);

        if (layer.type === 'video') {
          return (
            <video
              key={`${layer.id}-${layer.url}`}
              ref={(el) => {
                if (el) {
                  overlayVideoRefs.current.set(layer.id, el);
                } else {
                  overlayVideoRefs.current.delete(layer.id);
                }
              }}
              src={layer.url}
              className={`absolute inset-0 w-full h-full ${videoFitClass} cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-teal-500 ring-offset-2 ring-offset-black' : ''
                }`}
              style={styles}
              playsInline
              preload="auto"
              onLoadedData={(e) => {
                // Seek to correct time when loaded
                const video = e.currentTarget;
                if (layer.clipTime !== undefined) {
                  video.currentTime = layer.clipTime;
                }
                // Auto-play if timeline is playing
                if (isPlaying) {
                  video.play().catch(() => { });
                }
              }}
              onMouseDown={(e) => handleLayerMouseDown(e, layer)}
            />
          );
        }

        if (layer.type === 'image') {
          // For overlay images (V2, V3), use explicit sizing instead of fill-then-scale
          if (isOverlay) {
            const scale = layer.transform?.scale || 0.2;
            const xOffset = layer.transform?.x || 0;
            const yOffset = layer.transform?.y || 0;
            const baseZIndex = (styles.zIndex as number) || 0;

            return (
              <div
                key={layer.id}
                data-layer-id={layer.id}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  width: `${scale * 100}%`,
                  top: `calc(70% + ${yOffset}px)`,
                  left: `calc(50% + ${xOffset}px)`,
                  transform: 'translateX(-50%)',
                  zIndex: baseZIndex + 100,
                  opacity: layer.transform?.opacity ?? 1,
                }}
                onMouseDown={(e) => handleLayerMouseDown(e, layer)}
              >
                <img
                  src={layer.url}
                  alt="Layer"
                  className="w-full h-auto rounded-lg shadow-lg pointer-events-none"
                  draggable={false}
                />
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute inset-0 ring-2 ring-teal-500 rounded-lg pointer-events-none" />
                )}
                {/* Drag handle indicator */}
                {!isDragging && (
                  <div className="absolute top-2 right-2 p-1.5 bg-black/60 rounded text-white/70 pointer-events-none">
                    <Move className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          }

          // For V1 images (full background), use the original fill approach
          return (
            <div
              key={layer.id}
              className="absolute inset-0 w-full h-full"
              style={{ ...styles, pointerEvents: 'none' }}
            >
              <img
                src={layer.url}
                alt="Layer"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            </div>
          );
        }

        if (layer.type === 'caption' && layer.captionWords && layer.captionStyle) {
          const isCaptionSelected = selectedLayerId === layer.id;
          const isEditing = editingCaptionId === layer.id;
          const captionX = layer.transform?.x || 0;
          const captionY = layer.transform?.y || 0;
          const boxWidth = layer.captionStyle.boxWidth || 90;

          return (
            <div
              key={layer.id}
              data-layer-id={layer.id}
              className={`absolute z-40 ${isEditing ? '' : 'cursor-grab active:cursor-grabbing'}`}
              style={{
                left: '50%',
                bottom: layer.captionStyle.position === 'top' ? undefined : layer.captionStyle.position === 'center' ? undefined : '8%',
                top: layer.captionStyle.position === 'top' ? '8%' : layer.captionStyle.position === 'center' ? '50%' : undefined,
                transform: `translate(calc(-50% + ${captionX}px), ${layer.captionStyle.position === 'center' ? `calc(-50% + ${captionY}px)` : `${captionY}px`})`,
                width: `${boxWidth}%`,
                maxWidth: '100%',
                textAlign: 'center' as const,
                pointerEvents: 'auto',
              }}
              onMouseDown={(e) => handleLayerMouseDown(e, layer)}
              onDoubleClick={(e) => handleCaptionDoubleClick(e, layer)}
            >
              {/* Selection ring + resize handles */}
              {isCaptionSelected && !isEditing && (
                <>
                  <div className="absolute -inset-2 border-2 border-teal-500 rounded pointer-events-none" />
                  {/* Resize handle - bottom right corner */}
                  <div
                    className="absolute -bottom-3 -right-3 w-5 h-5 bg-teal-500 rounded-full cursor-nwse-resize flex items-center justify-center z-50 hover:bg-teal-400 shadow-lg"
                    onMouseDown={(e) => handleResizeMouseDown(e, layer)}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5">
                      <path d="M2 8L8 2M5 8L8 5" />
                    </svg>
                  </div>
                </>
              )}

              {isEditing ? (
                /* Inline text editor */
                <textarea
                  ref={editInputRef}
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={commitCaptionEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitCaptionEdit(); }
                    if (e.key === 'Escape') { setEditingCaptionId(null); setEditingText(''); }
                  }}
                  className="bg-black/70 text-white border-2 border-teal-500 rounded-lg p-3 w-full resize-none outline-none text-center"
                  style={{
                    fontFamily: layer.captionStyle.fontFamily,
                    fontSize: `${layer.captionStyle.fontSize}px`,
                    fontWeight: layer.captionStyle.fontWeight === 'black' ? 900 : layer.captionStyle.fontWeight === 'bold' ? 700 : 400,
                    color: layer.captionStyle.color,
                    lineHeight: 1.4,
                    minHeight: '1.5em',
                  }}
                  rows={Math.max(1, Math.ceil(editingText.length / 30))}
                />
              ) : (
                /* Normal caption render */
                <CaptionRenderer
                  words={layer.captionWords}
                  style={layer.captionStyle}
                  currentTime={layer.clipTime}
                  inline
                />
              )}
            </div>
          );
        }

        // Audio layers - invisible but play audio synced to timeline
        if (layer.type === 'audio') {
          return (
            <audio
              key={`audio-${layer.id}`}
              ref={(el) => {
                if (el) {
                  overlayVideoRefs.current.set(layer.id, el as unknown as HTMLVideoElement);
                } else {
                  overlayVideoRefs.current.delete(layer.id);
                }
              }}
              src={layer.url}
              preload="auto"
              onLoadedData={(e) => {
                const audio = e.currentTarget;
                if (layer.clipTime !== undefined) {
                  audio.currentTime = layer.clipTime;
                }
                if (isPlaying) {
                  audio.play().catch(() => { });
                }
              }}
              style={{ display: 'none' }}
            />
          );
        }

        return null;
      })}

      {/* Layer count indicator */}
      {layers.length > 1 && (
        <div className="absolute top-3 left-3 text-xs text-white/60 bg-black/50 px-2 py-1 rounded flex items-center gap-1 z-50">
          <Layers className="w-3 h-3" />
          <span>{layers.length} layers</span>
        </div>
      )}

      {/* Type indicator */}
      <div className="absolute bottom-3 right-3 text-xs text-white/60 bg-black/50 px-2 py-1 rounded flex items-center gap-1 z-50">
        {baseVideoLayer ? <Play className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
        <span>{baseVideoLayer ? 'video' : layers[0]?.type}</span>
      </div>

      {/* Alignment guides */}
      {draggingLayer && alignGuides.v && (
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-teal-400/70 z-50 pointer-events-none" style={{ transform: 'translateX(-0.5px)' }} />
      )}
      {draggingLayer && alignGuides.h && (
        <div className="absolute left-0 right-0 top-1/2 h-px bg-teal-400/70 z-50 pointer-events-none" style={{ transform: 'translateY(-0.5px)' }} />
      )}

      {/* Dragging indicator */}
      {draggingLayer && (
        <div className="absolute bottom-3 left-3 text-xs text-teal-400 bg-black/70 px-2 py-1 rounded z-50">
          Dragging...
        </div>
      )}
    </div>
  );
});

export default VideoPreview;
