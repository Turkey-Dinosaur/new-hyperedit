import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Trash2, Loader2, FolderOpen, Plus } from 'lucide-react';

const Spline = lazy(() => import('@splinetool/react-spline'));

const FFMPEG_SERVER = 'http://localhost:3333';

interface ProjectInfo {
  sessionId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  assetCount: number;
  thumbnail: string | null;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${day} ${month} ${year} \u00B7 ${h12}:${mins} ${ampm}`;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<ProjectInfo | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${FFMPEG_SERVER}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.sessions || []);
      }
    } catch {
      // Server not running — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim() || 'Untitled Project';
    setCreating(true);
    try {
      const res = await fetch(`${FFMPEG_SERVER}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.sessionId) {
        localStorage.setItem('clipwise-session', JSON.stringify({
          sessionId: data.sessionId,
          createdAt: Date.now(),
        }));
        navigate(`/editor?session=${data.sessionId}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenProject = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('Open Project requires Chrome or Edge browser.');
      return;
    }

    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();

      // Verify it's a valid ClipWise project by reading project.json
      let projectJson: FileSystemFileHandle;
      try {
        projectJson = await dirHandle.getFileHandle('project.json');
      } catch {
        alert('Not a valid ClipWise project — no project.json found.');
        return;
      }

      const projectFile = await projectJson.getFile();
      const projectData = JSON.parse(await projectFile.text());
      const projectName = projectData.name || dirHandle.name || 'Imported Project';

      // Create a new session on the server
      const createRes = await fetch(`${FFMPEG_SERVER}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName }),
      });
      const { sessionId } = await createRes.json();

      // Upload assets from the assets/ subdirectory
      try {
        const assetsDir = await dirHandle.getDirectoryHandle('assets');
        // Use values() iterator which has broader TS support
        const iterator = (assetsDir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
        for await (const handle of iterator) {
          if (handle.kind !== 'file' || handle.name.includes('_thumb')) continue;
          const file = await (handle as FileSystemFileHandle).getFile();
          const formData = new FormData();
          formData.append('file', file, handle.name);
          await fetch(`${FFMPEG_SERVER}/session/${sessionId}/assets`, {
            method: 'POST',
            body: formData,
          });
        }
      } catch {
        // No assets directory — that's fine, empty project
      }

      // Save the project state (clips, tracks, settings)
      if (projectData.clips || projectData.tracks || projectData.settings) {
        await fetch(`${FFMPEG_SERVER}/session/${sessionId}/project`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracks: projectData.tracks,
            clips: projectData.clips,
            settings: projectData.settings,
            name: projectName,
          }),
        });
      }

      localStorage.setItem('clipwise-session', JSON.stringify({
        sessionId,
        createdAt: Date.now(),
      }));
      navigate(`/editor?session=${sessionId}`);
    } catch (err) {
      // User cancelled the picker or other error
      if ((err as Error).name !== 'AbortError') {
        console.error('Open project error:', err);
      }
    }
  };

  const handleDeleteProject = async () => {
    if (!showDeleteModal) return;
    setDeleting(true);
    try {
      await fetch(`${FFMPEG_SERVER}/session/${showDeleteModal.sessionId}`, { method: 'DELETE' });
      // Clear localStorage if this was the active session
      try {
        const stored = JSON.parse(localStorage.getItem('clipwise-session') || '{}');
        if (stored.sessionId === showDeleteModal.sessionId) {
          localStorage.removeItem('clipwise-session');
        }
      } catch { /* ignore */ }
      setProjects(prev => prev.filter(p => p.sessionId !== showDeleteModal.sessionId));
      setShowDeleteModal(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenExisting = (sessionId: string) => {
    localStorage.setItem('clipwise-session', JSON.stringify({
      sessionId,
      createdAt: Date.now(),
    }));
    navigate(`/editor?session=${sessionId}`);
  };

  return (
    <div className="h-screen w-screen bg-zinc-950 relative overflow-hidden" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Left Content */}
      <div className="relative z-10 flex flex-col justify-center h-full pl-[17%] pr-16 max-w-[800px]">
        {/* Headline */}
        <div className="mb-10">
          <h1 className="text-5xl xl:text-6xl text-white leading-tight font-light" style={{ letterSpacing: '-0.01em' }}>
            Effortless<br />
            AI integration<br />
            <span className="italic bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">for editing</span>
          </h1>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 mb-12">
          <button
            onClick={() => { setNewProjectName(''); setShowNewModal(true); }}
            className="flex items-center gap-2 px-6 py-3 border border-orange-500 text-orange-500 font-semibold text-sm tracking-wider uppercase rounded-lg hover:bg-orange-500/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
          <button
            onClick={handleOpenProject}
            className="flex items-center gap-2 px-6 py-3 border border-zinc-600 text-white font-semibold text-sm tracking-wider uppercase rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Open Project
          </button>
        </div>

        {/* Recent Projects */}
        <div className="max-w-lg">
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-500 tracking-widest uppercase">Recent Projects</h2>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-sm">
                  No projects yet
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.sessionId}
                    className="flex items-center justify-between px-5 py-3 hover:bg-zinc-800/50 cursor-pointer transition-colors border-b border-zinc-800/50 last:border-b-0"
                    onClick={() => handleOpenExisting(project.sessionId)}
                    onMouseEnter={() => setHoveredRow(project.sessionId)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">{project.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{formatDate(project.updatedAt)}</div>
                    </div>
                    {hoveredRow === project.sessionId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteModal(project); }}
                        className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors flex-shrink-0 ml-3"
                      >
                        <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-400" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Spline Background */}
      <div className="absolute inset-0 hidden lg:block">
        <Suspense fallback={<div className="w-full h-full bg-zinc-950" />}>
          <Spline scene="https://prod.spline.design/jl9XAJR4miblrygs/scene.splinecode" />
        </Suspense>
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="absolute inset-0" onClick={() => !creating && setShowNewModal(false)} />
          <div className="relative bg-zinc-900 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-zinc-700">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-base font-semibold text-white">New Project</h2>
            </div>
            <div className="p-5">
              <label className="block text-sm text-zinc-400 mb-2">Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewModal(false); }}
                placeholder="My Awesome Video"
                autoFocus
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              />
              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={() => setShowNewModal(false)}
                  disabled={creating}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={creating}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="absolute inset-0" onClick={() => !deleting && setShowDeleteModal(null)} />
          <div className="relative bg-zinc-900 rounded-xl shadow-2xl max-w-sm w-full mx-4 border border-zinc-700">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-base font-semibold text-white">Delete Project</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-400">
                Are you sure you want to delete <span className="text-white font-medium">"{showDeleteModal.name}"</span>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  disabled={deleting}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
