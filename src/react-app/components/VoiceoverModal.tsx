import { useRef, useState } from 'react';
import { Copy, Check, X, Upload, SkipForward } from 'lucide-react';

interface VoiceoverModalProps {
  script: string;
  onSubmit: (file: File) => void;
  onCancel: () => void;
  onSkip?: () => void;
}

export function VoiceoverModal({ script, onSubmit, onCancel, onSkip }: VoiceoverModalProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleSubmit = () => {
    if (audioFile) onSubmit(audioFile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-white">Provide voiceover audio</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Copy the script, record or generate the voiceover, then upload the audio file.</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex-1 overflow-y-auto">
          <div className="relative">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-200 transition-colors"
              aria-label="Copy script to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <textarea
              value={script}
              readOnly
              className="w-full h-56 resize-none px-3 py-3 pr-20 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          <div className="mt-5">
            <label className="block text-xs font-medium text-zinc-300 mb-2">Voiceover audio file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setAudioFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-950 hover:bg-zinc-900 transition-colors text-left"
            >
              <Upload className="w-5 h-5 text-zinc-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-zinc-200 truncate">
                  {audioFile ? audioFile.name : 'Click to choose an audio file'}
                </div>
                <div className="text-xs text-zinc-500">
                  {audioFile
                    ? `${(audioFile.size / (1024 * 1024)).toFixed(1)} MB`
                    : 'MP3, WAV, M4A, etc.'}
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800 bg-zinc-950/40">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!audioFile}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit & continue
          </button>
        </div>
      </div>
    </div>
  );
}
