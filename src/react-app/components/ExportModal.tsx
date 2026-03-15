import { useEffect, useCallback } from 'react';
import { X, Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'rendering' | 'complete' | 'error';
  progress?: number; // 0-100
  statusMessage?: string;
  etaSeconds?: number | null;
  videoUrl?: string;
  filePath?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s remaining` : `${mins}m remaining`;
}

export default function ExportModal({
  isOpen,
  onClose,
  status,
  progress = 0,
  statusMessage,
  etaSeconds,
  videoUrl,
  filePath,
  errorMessage,
  onRetry,
}: ExportModalProps) {
  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}-${pad(now.getHours())}${pad(now.getMinutes())}-Rendered.mp4`;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [videoUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'rendering') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, status, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      {/* Backdrop click to close (only when not rendering) */}
      <div
        className="absolute inset-0"
        onClick={status !== 'rendering' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">
            {status === 'rendering' ? 'Exporting Video...' : status === 'complete' ? 'Export Complete' : 'Export Failed'}
          </h2>
          {status !== 'rendering' && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Rendering state */}
          {status === 'rendering' && (
            <div className="flex flex-col items-center py-6 gap-5">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />

              {/* Progress bar */}
              <div className="w-full space-y-2">
                <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(progress, 1)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="text-zinc-300 font-medium">{Math.round(progress)}%</span>
                  {etaSeconds != null && etaSeconds > 0 && (
                    <span>{formatEta(etaSeconds)}</span>
                  )}
                </div>
              </div>

              <p className="text-sm text-zinc-400 text-center">
                {statusMessage || 'Rendering your video...'}
              </p>
            </div>
          )}

          {/* Complete state */}
          {status === 'complete' && videoUrl && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Ready to download</span>
              </div>

              {/* Video preview */}
              <div className="rounded-lg overflow-hidden bg-black">
                <video
                  src={videoUrl}
                  controls
                  className="w-full max-h-[400px]"
                  autoPlay={false}
                  playsInline
                />
              </div>

              {/* File path */}
              {filePath && (
                <div className="px-3 py-2 bg-zinc-800/70 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-0.5">Saved to</p>
                  <p className="text-xs text-zinc-300 font-mono break-all select-all">{filePath}</p>
                </div>
              )}

              {/* Download button */}
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Video
              </button>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm text-zinc-400 text-center">
                {errorMessage || 'An unexpected error occurred during export.'}
              </p>
              <div className="flex gap-3">
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
