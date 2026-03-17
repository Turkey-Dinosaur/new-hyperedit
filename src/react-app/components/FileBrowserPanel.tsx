import { useState, useCallback, useEffect, useRef } from 'react';
import { FolderOpen, FileVideo, FileImage, FileAudio, ChevronRight, ArrowUp, X, Loader2, Check, HardDrive } from 'lucide-react';

interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: number;
}

interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

interface FileBrowserPanelProps {
  sessionId: string;
  onClose: () => void;
  onImported: (assets: { id: string; type: string; filename: string; duration: number; size: number; width: number; height: number; thumbnailUrl: string | null; streamUrl: string }[]) => void;
}

const LOCAL_FFMPEG_URL = 'http://localhost:3333';

const LAST_DIR_KEY = 'hyperedit-last-browse-dir';
const DEFAULT_BROWSE_DIR = 'C:\\Users\\Ashley\\OneDrive\\Coedwig Creations\\Clips';

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v'].includes(ext)) {
    return <FileVideo className="w-4 h-4 text-blue-400" />;
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(ext)) {
    return <FileImage className="w-4 h-4 text-green-400" />;
  }
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma'].includes(ext)) {
    return <FileAudio className="w-4 h-4 text-purple-400" />;
  }
  return <FileVideo className="w-4 h-4 text-zinc-400" />;
}

export default function FileBrowserPanel({ sessionId, onClose, onImported }: FileBrowserPanelProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const pathInputRef = useRef<HTMLInputElement>(null);

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    setSelectedFiles(new Set());
    try {
      const url = path
        ? `${LOCAL_FFMPEG_URL}/browse?path=${encodeURIComponent(path)}`
        : `${LOCAL_FFMPEG_URL}/browse`;
      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to browse directory');
      }
      const data: BrowseResult = await response.json();
      setCurrentPath(data.path);
      setParentPath(data.parent);
      setEntries(data.entries);
      localStorage.setItem(LAST_DIR_KEY, data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory
  useEffect(() => {
    const lastDir = localStorage.getItem(LAST_DIR_KEY);
    browse(lastDir || DEFAULT_BROWSE_DIR);
  }, [browse]);

  const handleEntryClick = useCallback((entry: BrowseEntry) => {
    if (entry.type === 'directory') {
      const newPath = currentPath.includes('/')
        ? `${currentPath}/${entry.name}`
        : `${currentPath}\\${entry.name}`;
      browse(newPath);
    }
  }, [currentPath, browse]);

  const toggleFileSelection = useCallback((fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  }, []);

  const selectAllFiles = useCallback(() => {
    const allFiles = entries.filter(e => e.type === 'file').map(e => e.name);
    setSelectedFiles(prev => {
      if (prev.size === allFiles.length) return new Set(); // Deselect all
      return new Set(allFiles);
    });
  }, [entries]);

  const handleImport = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const sep = currentPath.includes('/') ? '/' : '\\';
      const paths = Array.from(selectedFiles).map(name => `${currentPath}${sep}${name}`);

      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${sessionId}/import-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }

      const data = await response.json();
      onImported(data.assets);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [selectedFiles, currentPath, sessionId, onImported, onClose]);

  // Breadcrumb segments from path
  const pathSegments = currentPath.split(/[/\\]/).filter(Boolean);
  const fileCount = entries.filter(e => e.type === 'file').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-teal-500" />
            <span className="text-lg font-semibold text-white">Browse Files</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Breadcrumb / path input navigation */}
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-1 overflow-x-auto">
          {parentPath && !editingPath && (
            <button
              onClick={() => browse(parentPath)}
              className="p-1 hover:bg-zinc-800 rounded transition-colors flex-shrink-0"
              title="Go up"
            >
              <ArrowUp className="w-4 h-4 text-zinc-400" />
            </button>
          )}

          {editingPath ? (
            <form
              className="flex-1 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (pathInput.trim()) {
                  browse(pathInput.trim());
                }
                setEditingPath(false);
              }}
            >
              <input
                ref={pathInputRef}
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onBlur={() => setEditingPath(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingPath(false); }}
                placeholder="Type a folder path, e.g. C:\Users\Ashley\OneDrive\Videos"
                className="flex-1 px-2 py-1 bg-zinc-800 border border-teal-600 rounded text-xs text-white placeholder-zinc-500 focus:outline-none"
                autoFocus
              />
            </form>
          ) : (
            <div
              className="flex items-center gap-1 flex-1 cursor-text min-h-[24px]"
              onClick={() => {
                setPathInput(currentPath);
                setEditingPath(true);
                setTimeout(() => pathInputRef.current?.select(), 0);
              }}
              title="Click to type a path"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  browse(pathSegments[0] ? (currentPath.startsWith('/') ? '/' : `${pathSegments[0]}\\`) : undefined);
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-zinc-800 rounded text-xs text-zinc-400 hover:text-white transition-colors flex-shrink-0"
              >
                <HardDrive className="w-3 h-3" />
              </button>
              {pathSegments.map((segment, i) => {
                const sep = currentPath.includes('/') ? '/' : '\\';
                const segmentPath = (currentPath.startsWith('/') ? '/' : '') + pathSegments.slice(0, i + 1).join(sep);
                return (
                  <div key={i} className="flex items-center gap-1 flex-shrink-0">
                    <ChevronRight className="w-3 h-3 text-zinc-600" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        browse(segmentPath);
                      }}
                      className="px-1.5 py-0.5 hover:bg-zinc-800 rounded text-xs text-zinc-400 hover:text-white transition-colors truncate max-w-[150px]"
                      title={segment}
                    >
                      {segment}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto">
          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                <tr className="text-left text-zinc-500 text-xs">
                  <th className="px-4 py-2 w-8">
                    {fileCount > 0 && (
                      <button
                        onClick={selectAllFiles}
                        className="p-0.5 hover:bg-zinc-800 rounded transition-colors"
                        title={selectedFiles.size === fileCount ? 'Deselect all' : 'Select all files'}
                      >
                        <div className={`w-3.5 h-3.5 rounded border ${selectedFiles.size === fileCount && fileCount > 0 ? 'bg-teal-600 border-teal-600' : 'border-zinc-600'} flex items-center justify-center`}>
                          {selectedFiles.size === fileCount && fileCount > 0 && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </button>
                    )}
                  </th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2 w-24 text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.name}
                    onClick={(e) => entry.type === 'directory' ? handleEntryClick(entry) : toggleFileSelection(entry.name, e)}
                    className={`cursor-pointer border-b border-zinc-800/30 transition-colors ${
                      entry.type === 'file' && selectedFiles.has(entry.name)
                        ? 'bg-teal-600/15 hover:bg-teal-600/25'
                        : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <td className="px-4 py-2">
                      {entry.type === 'file' && (
                        <div className={`w-3.5 h-3.5 rounded border ${selectedFiles.has(entry.name) ? 'bg-teal-600 border-teal-600' : 'border-zinc-600'} flex items-center justify-center`}>
                          {selectedFiles.has(entry.name) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {entry.type === 'directory' ? (
                          <FolderOpen className="w-4 h-4 text-yellow-500" />
                        ) : (
                          getFileIcon(entry.name)
                        )}
                        <span className={`truncate ${entry.type === 'directory' ? 'text-white font-medium' : 'text-zinc-300'}`}>
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-zinc-500 text-xs whitespace-nowrap">
                      {entry.type === 'file' ? formatSize(entry.size) : ''}
                    </td>
                  </tr>
                ))}

                {entries.length === 0 && !loading && (
                  <tr>
                    <td colSpan={3} className="text-center text-zinc-500 py-12">
                      No media files found in this directory.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {selectedFiles.size > 0
              ? `${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''} selected`
              : `${fileCount} media file${fileCount !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={handleImport}
            disabled={selectedFiles.size === 0 || importing}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import{selectedFiles.size > 0 ? ` (${selectedFiles.size})` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
