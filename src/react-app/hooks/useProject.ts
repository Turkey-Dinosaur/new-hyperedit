import { useState, useCallback, useRef, useEffect } from 'react';

const LOCAL_FFMPEG_URL = 'http://localhost:3333';
const SESSION_STORAGE_KEY = 'hyperedit-session';

// Asset - source file in library
export interface Asset {
  id: string;
  type: 'video' | 'image' | 'audio';
  filename: string;
  duration: number;
  size: number;
  width?: number;
  height?: number;
  thumbnailUrl: string | null;
  streamUrl?: string; // URL with cache-busting timestamp
  aiGenerated?: boolean; // True if this is a Remotion-generated animation
  linked?: boolean; // True if imported by reference (original file not copied)
}

// TimelineClip - instance on timeline
export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed?: number;
  volume?: number;
  transform?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    cropTop?: number;
    cropBottom?: number;
    cropLeft?: number;
    cropRight?: number;
  };
}

// Track
export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  name: string;
  order: number;
}

// Caption word with timing
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

// Caption styling options
export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'black';
  color: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  position: 'bottom' | 'center' | 'top';
  animation: 'none' | 'karaoke' | 'fade' | 'pop' | 'bounce' | 'typewriter';
  highlightColor?: string;
  timeOffset?: number; // Offset in seconds to adjust sync (negative = earlier, positive = later)
  boxWidth?: number; // Text box width as percentage (10-100), default 90
}

// Caption clip data (stored alongside TimelineClip)
export interface CaptionData {
  words: CaptionWord[];
  style: CaptionStyle;
}

// Project settings
export interface ProjectSettings {
  width?: number;
  height?: number;
  fps: number;
}

// Project state
export interface ProjectState {
  tracks: Track[];
  clips: TimelineClip[];
  settings: ProjectSettings;
}

// Timeline tab for editing clips in isolation
export interface TimelineTab {
  id: string;
  name: string;
  type: 'main' | 'clip';
  assetId?: string; // For clip tabs, the asset being edited
  clips: TimelineClip[];
}

// Session info
export interface SessionInfo {
  sessionId: string;
  createdAt: number;
}

// Helper to load session from URL param or localStorage
function loadSessionFromStorage(): SessionInfo | null {
  try {
    // Check URL query param first (?session=xxx)
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('session');
    if (urlSessionId) {
      const sessionInfo: SessionInfo = { sessionId: urlSessionId, createdAt: Date.now() };
      // Persist to localStorage so it works on refresh
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionInfo));
      return sessionInfo;
    }

    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load session from storage:', e);
  }
  return null;
}

export function useProject() {
  // Initialize session from localStorage if available
  const [session, setSessionInternal] = useState<SessionInfo | null>(loadSessionFromStorage);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tracks, setTracks] = useState<Track[]>([
    { id: 'T1', type: 'text', name: 'T1', order: 0 },   // Captions/text track (top)
    { id: 'V1', type: 'video', name: 'V1', order: 1 },  // Base video track
    { id: 'V2', type: 'video', name: 'V2', order: 2 },  // Overlay
    { id: 'V3', type: 'video', name: 'V3', order: 3 },  // Top overlay
    { id: 'A1', type: 'audio', name: 'A1', order: 4 },  // Audio track 1
    { id: 'A2', type: 'audio', name: 'A2', order: 5 },  // Audio track 2
  ]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  interface HistorySnapshot {
    clips: TimelineClip[];
    captionData: Record<string, CaptionData>;
  }
  const [undoHistory, setUndoHistory] = useState<HistorySnapshot[]>([]);
  const [redoHistory, setRedoHistory] = useState<HistorySnapshot[]>([]);
  const [captionData, setCaptionData] = useState<Record<string, CaptionData>>({});
  const captionDataRef = useRef(captionData);
  const preDragClipsRef = useRef<TimelineClip[] | null>(null);

  // History Recording Helper
  const recordHistory = useCallback((currentClips: TimelineClip[]) => {
    setUndoHistory(prev => {
      const next = [...prev, { clips: [...currentClips], captionData: { ...captionDataRef.current } }];
      if (next.length > 50) next.shift();
      return next;
    });
    setRedoHistory([]);
  }, []);

  // Undo / Redo Actions
  const undo = useCallback(() => {
    setUndoHistory(prev => {
      if (prev.length === 0) return prev;
      const historyCopy = [...prev];
      const previousState = historyCopy.pop()!;
      setRedoHistory(rList => [{ clips: [...clips], captionData: { ...captionDataRef.current } }, ...rList]);
      setClips(previousState.clips);
      setCaptionData(previousState.captionData);
      return historyCopy;
    });
  }, [clips]);

  const redo = useCallback(() => {
    setRedoHistory(prev => {
      if (prev.length === 0) return prev;
      const historyCopy = [...prev];
      const nextState = historyCopy.shift()!;
      setUndoHistory(uList => [...uList, { clips: [...clips], captionData: { ...captionDataRef.current } }]);
      setClips(nextState.clips);
      setCaptionData(nextState.captionData);
      return historyCopy;
    });
  }, [clips]);

  const canUndo = undoHistory.length > 0;
  const canRedo = redoHistory.length > 0;

  // Drag history helpers — call beginDrag at start, commitDrag at end (one undo entry per gesture)
  const beginDrag = useCallback(() => {
    preDragClipsRef.current = [...clips];
  }, [clips]);

  const commitDrag = useCallback(() => {
    if (preDragClipsRef.current) {
      recordHistory(preDragClipsRef.current);
      preDragClipsRef.current = null;
    }
  }, [recordHistory]);

  // Snapshot for Home.tsx callers that do direct setClips (auto-order, merge)
  const recordSnapshot = useCallback(() => {
    recordHistory(clips);
  }, [clips, recordHistory]);

  // Timeline tabs for editing clips in isolation
  const [timelineTabs, setTimelineTabs] = useState<TimelineTab[]>([
    { id: 'main', name: 'Main', type: 'main', clips: [] }
  ]);
  const [activeTabId, setActiveTabId] = useState('main');

  // DEBUG: Track when activeTabId changes
  const prevActiveTabIdRef = useRef(activeTabId);
  useEffect(() => {
    if (prevActiveTabIdRef.current !== activeTabId) {
      console.log('=================================================');
      console.log('[useProject] ⚠️ activeTabId CHANGED!');
      console.log(`  FROM: "${prevActiveTabIdRef.current}" TO: "${activeTabId}"`);
      console.log('=================================================');
      console.trace('[useProject] Stack trace for activeTabId change:');
      prevActiveTabIdRef.current = activeTabId;
    }
  }, [activeTabId]);

  const [settings, setSettings] = useState<ProjectSettings>({
    width: undefined,
    height: undefined,
    fps: 30,
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to track latest state values for saveProject (avoids stale closure issues)
  const tracksRef = useRef(tracks);
  const clipsRef = useRef(clips);
  const settingsRef = useRef(settings);

  // Keep refs in sync with state
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { captionDataRef.current = captionData; }, [captionData]);

  // Wrapper to persist session to localStorage
  const setSession = useCallback((sessionOrUpdater: SessionInfo | null | ((prev: SessionInfo | null) => SessionInfo | null)) => {
    setSessionInternal(prev => {
      const newSession = typeof sessionOrUpdater === 'function' ? sessionOrUpdater(prev) : sessionOrUpdater;
      if (newSession) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      return newSession;
    });
  }, []);

  // Check if local server is available
  const checkServer = useCallback(async (): Promise<boolean> => {
    if (serverAvailable !== null) return serverAvailable;

    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      const data = await response.json();
      const available = data.status === 'ok';
      setServerAvailable(available);
      return available;
    } catch {
      setServerAvailable(false);
      return false;
    }
  }, [serverAvailable]);

  // Validate stored session on mount - clear if server doesn't recognize it
  useEffect(() => {
    const validateSession = async () => {
      if (!session) return;

      try {
        const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.status === 404) {
          // Session no longer exists on server - clear it
          console.log('Stored session is invalid, clearing...');
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionInternal(null);
          setAssets([]);
          setClips([]);
          setCaptionData({});
        }
      } catch (error) {
        // Server might be down - don't clear session yet
        console.log('Could not validate session:', error);
      }
    };

    validateSession();
  }, []); // Only run once on mount

  // Create a new session
  const createSession = useCallback(async (): Promise<SessionInfo> => {
    // We'll create a session by uploading the first asset
    // For now, just generate a client-side session ID that will be
    // confirmed when we upload the first file
    const tempId = crypto.randomUUID();
    const sessionInfo: SessionInfo = {
      sessionId: tempId,
      createdAt: Date.now(),
    };
    return sessionInfo;
  }, []);

  // Upload asset
  const uploadAsset = useCallback(async (file: File): Promise<Asset> => {
    setLoading(true);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    setStatus(`Uploading ${file.name} (${fileSizeMB} MB)...`);

    try {
      let currentSession = session;

      // If no session yet, create one first
      if (!currentSession) {
        const createResponse = await fetch(`${LOCAL_FFMPEG_URL}/session/create`, {
          method: 'POST',
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.error || 'Failed to create session');
        }

        const createResult = await createResponse.json();
        currentSession = {
          sessionId: createResult.sessionId,
          createdAt: Date.now(),
        };
        setSession(currentSession);
      }

      // Upload the asset
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${currentSession.sessionId}/assets`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      const asset: Asset = {
        id: result.asset.id,
        type: result.asset.type,
        filename: result.asset.filename,
        duration: result.asset.duration,
        size: result.asset.size,
        width: result.asset.width,
        height: result.asset.height,
        thumbnailUrl: result.asset.thumbnailUrl
          ? `${LOCAL_FFMPEG_URL}${result.asset.thumbnailUrl}`
          : null,
      };

      setAssets(prev => [...prev, asset]);
      setStatus('');
      return asset;
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Import local files by path (no HTTP upload — server reads directly from disk)
  const importLocalFiles = useCallback(async (paths: string[]): Promise<Asset[]> => {
    setLoading(true);
    setStatus(`Importing ${paths.length} file${paths.length > 1 ? 's' : ''}...`);

    try {
      let currentSession = session;

      if (!currentSession) {
        const createResponse = await fetch(`${LOCAL_FFMPEG_URL}/session/create`, {
          method: 'POST',
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.error || 'Failed to create session');
        }

        const createResult = await createResponse.json();
        currentSession = {
          sessionId: createResult.sessionId,
          createdAt: Date.now(),
        };
        setSession(currentSession);
      }

      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${currentSession.sessionId}/import-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }

      const result = await response.json();
      const newAssets: Asset[] = result.assets.map((a: Record<string, unknown>) => ({
        id: a.id,
        type: a.type,
        filename: a.filename,
        duration: a.duration,
        size: a.size,
        width: a.width,
        height: a.height,
        thumbnailUrl: a.thumbnailUrl ? `${LOCAL_FFMPEG_URL}${a.thumbnailUrl}` : null,
        streamUrl: a.streamUrl ? `${LOCAL_FFMPEG_URL}${a.streamUrl}` : undefined,
        linked: Boolean(a.linked),
      }));

      setAssets(prev => [...prev, ...newAssets]);
      setStatus('');
      return newAssets;
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Delete asset
  const deleteAsset = useCallback(async (assetId: string): Promise<void> => {
    if (!session) return;

    await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${assetId}`, {
      method: 'DELETE',
    });

    setAssets(prev => prev.filter(a => a.id !== assetId));
    setClips(prev => prev.filter(c => c.assetId !== assetId));
  }, [session]);

  // Get asset stream URL
  const getAssetStreamUrl = useCallback((assetId: string): string | null => {
    if (!session) return null;
    return `${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${assetId}/stream`;
  }, [session]);

  // Refresh assets from server (useful after server-side asset generation)
  const refreshAssets = useCallback(async (): Promise<Asset[]> => {
    if (!session) return [];

    const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets`);
    if (!response.ok) {
      throw new Error('Failed to fetch assets');
    }

    const data = await response.json();
    const serverAssets: Asset[] = (data.assets || []).map((a: {
      id: string;
      type: 'video' | 'image' | 'audio';
      filename: string;
      duration: number;
      size: number;
      width?: number;
      height?: number;
      thumbnailUrl?: string | null;
      aiGenerated?: boolean;
      linked?: boolean;
    }) => ({
      id: a.id,
      type: a.type,
      filename: a.filename,
      duration: a.duration,
      size: a.size,
      width: a.width,
      height: a.height,
      thumbnailUrl: a.thumbnailUrl
        ? `${LOCAL_FFMPEG_URL}${a.thumbnailUrl}`
        : null,
      // Add cache-busting timestamp to force reload after file changes (e.g., dead air removal)
      streamUrl: `${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${a.id}/stream?v=${Date.now()}`,
      // Preserve aiGenerated flag for Remotion-generated animations (critical for edit workflow detection)
      aiGenerated: a.aiGenerated || false,
      linked: a.linked || false,
    }));

    setAssets(serverAssets);
    return serverAssets;
  }, [session]);

  // Add clip to timeline
  const addClip = useCallback((
    assetId: string,
    trackId: string,
    start: number,
    duration?: number,
    inPoint?: number,
    outPoint?: number
  ): TimelineClip => {
    const asset = assets.find(a => a.id === assetId);

    // For images, use provided duration or default to 5 seconds
    // For video/audio, use asset duration
    // If asset not found (race condition with refreshAssets), use provided duration or default
    let clipDuration: number;
    if (duration !== undefined) {
      clipDuration = duration;
    } else if (asset) {
      clipDuration = asset.type === 'image' ? 5 : asset.duration;
    } else {
      clipDuration = 5; // Default fallback
      console.warn(`Asset ${assetId} not found in state, using default duration`);
    }

    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId,
      trackId,
      start,
      duration: clipDuration,
      inPoint: inPoint ?? 0,
      outPoint: outPoint ?? clipDuration,
    };

    setClips(prev => {
      recordHistory(prev);
      return [...prev, clip];
    });
    return clip;
  }, [assets]);

  // Update clip
  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>): void => {
    setClips(prev => {
      recordHistory(prev);
      return prev.map(c => c.id === clipId ? { ...c, ...updates } : c);
    });
  }, [recordHistory]);

  // Delete clip (with optional ripple/autosnap to shift subsequent clips)
  const deleteClip = useCallback((clipId: string, ripple: boolean = false): void => {
    setClips(prev => {
      const clipToDelete = prev.find(c => c.id === clipId);
      if (!clipToDelete) return prev.filter(c => c.id !== clipId);

      recordHistory(prev); // Record history only if there was a clip to delete

      // Remove the clip
      const filtered = prev.filter(c => c.id !== clipId);

      if (!ripple) return filtered;

      // Ripple mode: shift subsequent clips on the same track backward
      const deletedEnd = clipToDelete.start + clipToDelete.duration;
      const gapDuration = clipToDelete.duration;

      return filtered.map(c => {
        // Only shift clips on the same track that start at or after the deleted clip's end
        if (c.trackId === clipToDelete.trackId && c.start >= deletedEnd) {
          return {
            ...c,
            start: Math.max(0, c.start - gapDuration),
          };
        }
        return c;
      });
    });
  }, [recordHistory]);

  // Helper for magnetic snapping
  const getMagneticSnapPosition = (rawStart: number, duration: number, trackId: string, excludeClipId?: string, trackClipsObj?: TimelineClip[]): number => {
    let snappedStart = Math.max(0, rawStart);
    const clipsToSearch = trackClipsObj || clips;
    const trackClips = clipsToSearch.filter(c => c.trackId === trackId && c.id !== excludeClipId);
    let bestSnapDiff = 0.5; // Snap threshold (0.5 seconds)

    // Snap to 0 (beginning of timeline)
    if (rawStart < bestSnapDiff && rawStart >= 0) {
      snappedStart = 0;
      bestSnapDiff = rawStart;
    }

    trackClips.forEach(c => {
      const cEnd = c.start + c.duration;
      // Snap start to other's end
      if (Math.abs(snappedStart - cEnd) < bestSnapDiff) {
        snappedStart = cEnd;
        bestSnapDiff = Math.abs(snappedStart - cEnd);
      }
      // Snap start to other's start
      if (Math.abs(snappedStart - c.start) < bestSnapDiff) {
        snappedStart = c.start;
        bestSnapDiff = Math.abs(snappedStart - c.start);
      }
      // Snap end to other's start
      const end = snappedStart + duration;
      if (Math.abs(end - c.start) < bestSnapDiff) {
        snappedStart = c.start - duration;
        bestSnapDiff = Math.abs(end - c.start);
      }
      // Snap end to other's end
      if (Math.abs(end - cEnd) < bestSnapDiff) {
        snappedStart = cEnd - duration;
        bestSnapDiff = Math.abs(end - cEnd);
      }
    });
    return Math.max(0, snappedStart);
  };

  // Move clip (with magnetic snapping)
  const moveClip = useCallback((clipId: string, newStart: number, newTrackId?: string): void => {
    setClips(prev => {
      const clip = prev.find(c => c.id === clipId);
      if (!clip) return prev;

      const trackId = newTrackId ?? clip.trackId;
      const snappedStart = getMagneticSnapPosition(newStart, clip.duration, trackId, clipId, prev);

      // Return unchanged reference if nothing changed to prevent unnecessary renders
      if (clip.start === snappedStart && clip.trackId === trackId) return prev;

      return prev.map(c => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          start: snappedStart,
          trackId,
        };
      });
    });
  }, []);

  // Finalize clip move (resolves collisions: ripples if inserted, bumps track if placed over)
  const finalizeClipMove = useCallback((clipId: string): void => {
    setClips(prev => {
      const clip = prev.find(c => c.id === clipId);
      if (!clip) return prev;

      const trackClips = prev.filter(c => c.trackId === clip.trackId && c.id !== clipId);
      const end = clip.start + clip.duration;

      // Look for overlaps
      const overlaps = trackClips.filter(c => {
        const cEnd = c.start + c.duration;
        return clip.start < cEnd - 0.05 && end > c.start + 0.05; // 0.05s tolerance
      });

      if (overlaps.length === 0) return prev; // No overlaps, we are good

      // Sort overlaps by start time
      overlaps.sort((a, b) => a.start - b.start);
      const firstOverlap = overlaps[0];

      // Did we snap to the end of a prior clip (or drop at exactly 0)?
      const snappedToPrev = trackClips.some(c => Math.abs((c.start + c.duration) - clip.start) <= 0.05);
      const isStartInsert = clip.start <= 0.05;

      if (snappedToPrev || isStartInsert) {
        // INSERTION RIPPLE
        // Shift clips that start AT OR AFTER the first overlapped clip to the right
        const shiftAmount = end - firstOverlap.start;
        if (shiftAmount > 0) {
          return prev.map(c => {
            if (c.trackId === clip.trackId && c.id !== clipId && c.start >= firstOverlap.start - 0.05) {
              return { ...c, start: c.start + shiftAmount };
            }
            return c;
          });
        }
        return prev;
      }

      // OVERLAP BUMP
      // Find the next available track of the same type
      const currentTrack = tracksRef.current.find(t => t.id === clip.trackId);
      if (!currentTrack) return prev;

      const trackType = currentTrack.type;
      const sameTypeTracks = tracksRef.current.filter(t => t.type === trackType).sort((a, b) => a.order - b.order);

      // Find a track that has NO overlaps at this exact time interval
      let newTrackId = clip.trackId;
      for (const track of sameTypeTracks) {
        if (track.id === clip.trackId) continue;

        const potentialOverlaps = prev.filter(c =>
          c.trackId === track.id &&
          c.id !== clipId &&
          clip.start < c.start + c.duration - 0.05 &&
          end > c.start + 0.05
        );

        if (potentialOverlaps.length === 0) {
          newTrackId = track.id;
          break;
        }
      }

      if (newTrackId !== clip.trackId) {
        return prev.map(c => c.id === clipId ? { ...c, trackId: newTrackId } : c);
      }

      // If all existing tracks are full, bump it rightward to the end of the last overlap on the current track
      const lastOverlap = overlaps[overlaps.length - 1];
      const newStartForBump = lastOverlap.start + lastOverlap.duration;
      return prev.map(c => c.id === clipId ? { ...c, start: newStartForBump } : c);
    });
  }, []);

  // Resize clip (change in/out points or duration)
  const resizeClip = useCallback((clipId: string, newInPoint: number, newOutPoint: number, newStart?: number): void => {
    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      const newDuration = newOutPoint - newInPoint;
      return {
        ...c,
        inPoint: newInPoint,
        outPoint: newOutPoint,
        duration: newDuration,
        ...(newStart !== undefined ? { start: newStart } : {}),
      };
    }));
  }, []);

  // Split clip at a specific time, creating two clips
  const splitClip = useCallback((clipId: string, splitTime: number): string | null => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return null;

    // Calculate the time within the clip where the split occurs
    const timeInClip = splitTime - clip.start;

    // Validate: split must be within the clip's duration (with small buffer)
    if (timeInClip <= 0.05 || timeInClip >= clip.duration - 0.05) {
      return null; // Split too close to edge
    }

    recordHistory(clips);

    // Calculate the in-point offset for the split
    const splitInPoint = clip.inPoint + timeInClip;

    // Create the second clip (after the split)
    const secondClip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: clip.assetId,
      trackId: clip.trackId,
      start: splitTime,
      duration: clip.duration - timeInClip,
      inPoint: splitInPoint,
      outPoint: clip.outPoint,
      transform: clip.transform ? { ...clip.transform } : undefined,
    };

    // Update the first clip (before the split) and add the second clip
    setClips(prev => [
      ...prev.map(c => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          duration: timeInClip,
          outPoint: splitInPoint,
        };
      }),
      secondClip,
    ]);

    return secondClip.id;
  }, [clips]);

  // Create a new timeline tab for editing a clip/animation in isolation
  const createTimelineTab = useCallback((name: string, assetId: string, initialClips?: TimelineClip[]): string => {
    const tabId = crypto.randomUUID();
    const newTab: TimelineTab = {
      id: tabId,
      name,
      type: 'clip',
      assetId,
      clips: initialClips || [],
    };

    setTimelineTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);

    return tabId;
  }, []);

  // Switch to a different timeline tab
  const switchTimelineTab = useCallback((tabId: string): void => {
    console.log('[switchTimelineTab] Switching to tab:', tabId);
    console.trace('[switchTimelineTab] Call stack:');
    setActiveTabId(tabId);
  }, []);

  // Close a timeline tab (cannot close main)
  const closeTimelineTab = useCallback((tabId: string): void => {
    console.log('[closeTimelineTab] Attempting to close tab:', tabId);
    console.trace('[closeTimelineTab] Call stack:');
    if (tabId === 'main') return; // Cannot close main tab

    setTimelineTabs(prev => prev.filter(tab => tab.id !== tabId));

    // If closing the active tab, switch to main
    setActiveTabId(currentId => {
      if (currentId === tabId) {
        console.log('[closeTimelineTab] Active tab is being closed, switching to main');
        return 'main';
      }
      return currentId;
    });
  }, []);

  // Update clips in a specific tab
  const updateTabClips = useCallback((tabId: string, clips: TimelineClip[]): void => {
    setTimelineTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, clips } : tab
    ));
  }, []);

  // Update a tab's animation asset (used when editing an animation - now in-place)
  // This updates the V1 clip duration (asset ID stays the same for in-place edits)
  const updateTabAsset = useCallback((tabId: string, newAssetId: string, newDuration: number): void => {
    console.log('[updateTabAsset] Called with:', { tabId, newAssetId, newDuration });

    setTimelineTabs(prev => {
      const updatedTabs = prev.map(tab => {
        if (tab.id !== tabId) return tab;

        console.log('[updateTabAsset] Found tab to update:', {
          tabId: tab.id,
          currentAssetId: tab.assetId,
          newAssetId,
          isSameAsset: tab.assetId === newAssetId,
        });

        // Update the V1 clip to point to the new asset
        const updatedClips = tab.clips.map(clip => {
          if (clip.trackId === 'V1') {
            console.log('[updateTabAsset] Updating V1 clip:', {
              oldAssetId: clip.assetId,
              newAssetId,
              oldDuration: clip.duration,
              newDuration,
            });
            return {
              ...clip,
              assetId: newAssetId,
              duration: newDuration,
              outPoint: newDuration,
            };
          }
          return clip;
        });

        return {
          ...tab,
          assetId: newAssetId,
          clips: updatedClips,
        };
      });

      console.log('[updateTabAsset] Updated tabs:', updatedTabs.map(t => ({
        id: t.id,
        assetId: t.assetId,
        clipCount: t.clips.length,
      })));

      return updatedTabs;
    });
  }, []);

  // Get the active timeline tab
  const getActiveTab = useCallback((): TimelineTab | undefined => {
    return timelineTabs.find(tab => tab.id === activeTabId);
  }, [timelineTabs, activeTabId]);

  // Default caption style
  const defaultCaptionStyle: CaptionStyle = {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    position: 'bottom',
    animation: 'karaoke',
    highlightColor: '#FFD700',
  };

  // Add caption clip to timeline
  const addCaptionClip = useCallback((
    words: CaptionWord[],
    start: number,
    duration: number,
    style?: Partial<CaptionStyle>
  ): TimelineClip => {
    recordHistory(clips);
    const clipId = crypto.randomUUID();

    // Create the timeline clip
    const clip: TimelineClip = {
      id: clipId,
      assetId: '', // No asset for captions
      trackId: 'T1',
      start,
      duration,
      inPoint: 0,
      outPoint: duration,
    };

    setClips(prev => [...prev, clip]);
    
    setCaptionData(prev => {
      const existingIds = Object.keys(prev);
      const baseStyle = existingIds.length > 0 ? prev[existingIds[0]].style : defaultCaptionStyle;
      return {
        ...prev,
        [clipId]: {
          words,
          style: { ...baseStyle, ...style },
        },
      };
    });

    return clip;
  }, [clips, recordHistory]);

  // Add multiple caption clips at once (batched for performance)
  const addCaptionClipsBatch = useCallback((
    captions: Array<{
      words: CaptionWord[];
      start: number;
      duration: number;
      style?: Partial<CaptionStyle>;
    }>
  ): TimelineClip[] => {
    recordHistory(clips);
    const newClips: TimelineClip[] = [];
    const newCaptionData: Record<string, CaptionData> = {};

    const existingIds = Object.keys(captionData);
    const baseStyle = existingIds.length > 0 ? captionData[existingIds[0]].style : defaultCaptionStyle;

    for (const caption of captions) {
      const clipId = crypto.randomUUID();

      newClips.push({
        id: clipId,
        assetId: '',
        trackId: 'T1',
        start: caption.start,
        duration: caption.duration,
        inPoint: 0,
        outPoint: caption.duration,
      });

      newCaptionData[clipId] = {
        words: caption.words,
        style: { ...baseStyle, ...caption.style },
      };
    }

    // Single state update for all clips
    setClips(prev => [...prev, ...newClips]);
    setCaptionData(prev => ({ ...prev, ...newCaptionData }));

    return newClips;
  }, [clips, captionData, recordHistory]);

  // Update caption style
  const updateCaptionStyle = useCallback((clipId: string, styleUpdates: Partial<CaptionStyle>): void => {
    setCaptionData(prev => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        next[id] = {
          ...next[id],
          style: { ...next[id].style, ...styleUpdates },
        };
      }
      return next;
    });
  }, []);

  // Update caption words (for inline text editing)
  const updateCaptionWords = useCallback((clipId: string, words: CaptionWord[]): void => {
    setCaptionData(prev => {
      const existing = prev[clipId];
      if (!existing) return prev;
      return {
        ...prev,
        [clipId]: { ...existing, words },
      };
    });
  }, []);

  // Get caption data for a clip
  const getCaptionData = useCallback((clipId: string): CaptionData | null => {
    return captionData[clipId] || null;
  }, [captionData]);

  // Save project to server (debounced by default, immediate if specified)
  // Uses refs to always get latest state, avoiding stale closure issues
  const saveProject = useCallback(async (immediate = false): Promise<void> => {
    if (!session) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const doSave = async () => {
      try {
        await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracks: tracksRef.current,
            clips: clipsRef.current,
            settings: settingsRef.current,
            captionData: captionDataRef.current,
          }),
        });
        console.log('[Project] Saved');
      } catch (error) {
        console.error('[Project] Save failed:', error);
      }
    };

    if (immediate) {
      await doSave();
    } else {
      // Debounce saves - use refs to get latest state values
      saveTimeoutRef.current = setTimeout(doSave, 500);
    }
  }, [session]);

  // Load project from server (including assets)
  const loadProject = useCallback(async (): Promise<void> => {
    if (!session) return;

    try {
      // Fetch assets first
      const assetsResponse = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets`);
      if (assetsResponse.ok) {
        const assetsData = await assetsResponse.json();
        const serverAssets: Asset[] = (assetsData.assets || []).map((a: {
          id: string;
          type: 'video' | 'image' | 'audio';
          filename: string;
          duration: number;
          size: number;
          width?: number;
          height?: number;
          thumbnailUrl?: string | null;
          aiGenerated?: boolean;
        }) => ({
          id: a.id,
          type: a.type,
          filename: a.filename,
          duration: a.duration,
          size: a.size,
          width: a.width,
          height: a.height,
          thumbnailUrl: a.thumbnailUrl
            ? `${LOCAL_FFMPEG_URL}${a.thumbnailUrl}`
            : null,
          // Add cache-busting timestamp to force reload after file changes
          streamUrl: `${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${a.id}/stream?v=${Date.now()}`,
          // Preserve aiGenerated flag for Remotion-generated animations (critical for edit workflow detection)
          aiGenerated: a.aiGenerated || false,
        }));
        setAssets(serverAssets);
      }

      // Then fetch project
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`);
      if (response.ok) {
        const data = await response.json();
        // Don't load tracks from server - always use client's default tracks
        // Server tracks may be outdated (e.g., missing T1, V3, A2)
        if (data.clips) setClips(data.clips);
        if (data.settings) setSettings(data.settings);
        if (data.captionData) setCaptionData(data.captionData);
      }
    } catch (error) {
      console.error('[Project] Load failed:', error);
    }
  }, [session]);

  // Render project
  // Uses refs to always get latest state
  const renderProject = useCallback(async (preview = false): Promise<string> => {
    if (!session) throw new Error('No session');

    setLoading(true);
    setStatus(preview ? 'Rendering preview...' : 'Rendering export...');

    try {
      // Save project first - use refs to get latest state immediately and wait for it to complete
      await saveProject(true);

      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Render failed');
      }

      const result = await response.json();
      setStatus('Render complete!');

      // Return download URL
      return `${LOCAL_FFMPEG_URL}${result.downloadUrl}`;
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2000);
    }
  }, [session]);

  // Get total project duration
  const getDuration = useCallback((): number => {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(c => c.start + c.duration));
  }, [clips]);

  // Create animated GIF from an image asset
  const createGif = useCallback(async (
    sourceAssetId: string,
    options: {
      effect?: 'pulse' | 'zoom' | 'rotate' | 'bounce' | 'fade' | 'shake';
      duration?: number;
      fps?: number;
      width?: number;
      height?: number;
    } = {}
  ): Promise<Asset> => {
    if (!session) throw new Error('No session');

    setLoading(true);
    setStatus('Creating animated GIF...');

    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/create-gif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAssetId,
          ...options,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'GIF creation failed');
      }

      const result = await response.json();
      const asset: Asset = {
        id: result.asset.id,
        type: result.asset.type,
        filename: result.asset.filename,
        duration: result.asset.duration,
        size: result.asset.size,
        width: result.asset.width,
        height: result.asset.height,
        thumbnailUrl: result.asset.thumbnailUrl
          ? `${LOCAL_FFMPEG_URL}${result.asset.thumbnailUrl}`
          : null,
      };

      setAssets(prev => [...prev, asset]);
      setStatus('GIF created!');
      return asset;
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2000);
    }
  }, [session]);

  // Close session
  const closeSession = useCallback(async (): Promise<void> => {
    if (session) {
      try {
        await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}`, {
          method: 'DELETE',
        });
      } catch { }
    }
    setSession(null);
    setAssets([]);
    setClips([]);
  }, [session]);

  // Auto-save when clips change
  // Note: This is commented out to prevent excessive saves during drag operations
  // useEffect(() => {
  //   if (session && clips.length > 0) {
  //     saveProject();
  //   }
  // }, [clips, session, saveProject]);

  return {
    // State
    session,
    assets,
    tracks,
    clips,
    settings,
    loading,
    status,
    serverAvailable,

    // Session
    checkServer,
    createSession,
    closeSession,

    // Assets
    uploadAsset,
    importLocalFiles,
    deleteAsset,
    getAssetStreamUrl,
    refreshAssets,
    createGif,

    // Clips
    addClip,
    updateClip,
    deleteClip,
    moveClip,
    finalizeClipMove,
    resizeClip,
    splitClip,

    // Undo / Redo
    undo,
    redo,
    canUndo,
    canRedo,
    beginDrag,
    commitDrag,
    recordSnapshot,

    // Captions
    captionData,
    addCaptionClip,
    addCaptionClipsBatch,
    updateCaptionStyle,
    updateCaptionWords,
    getCaptionData,

    // Project
    saveProject,
    loadProject,
    renderProject,
    getDuration,

    // Setters for direct state manipulation
    setTracks,
    setClips,
    setSettings,

    // Timeline tabs
    timelineTabs,
    activeTabId,
    createTimelineTab,
    switchTimelineTab,
    closeTimelineTab,
    updateTabClips,
    updateTabAsset,
    getActiveTab,
  };
}
