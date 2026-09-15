/**
 * Adding a routine. Two lanes only: share sheet and file picker
 * (CONTENT_SOURCING.md). There is no URL field, by design.
 */

import { useRef, useState } from 'react';
import { ingestPhoto } from '../ingest/ingestPhoto';
import { ingestVideo, type IngestProgress } from '../ingest/ingestVideo';
import type { Routine } from '../storage/db';

interface Props {
  onDone: (routine: Routine) => void;
  onCancel: () => void;
  /** A file handed to us by the OS share sheet, if that's how we got here. */
  sharedFile?: File | null;
}

export function Ingest({ onDone, onCancel, sharedFile }: Props) {
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const handle = async (file: File) => {
    setError(null);
    abort.current = new AbortController();

    if (file.type.startsWith('image/')) {
      setProgress({ progress: 0.5, stage: 'tracking', message: 'Reading the pose…' });
      const result = await ingestPhoto(file);
      setProgress(null);
      if (result.ok) onDone(result.routine);
      else setError(result.message);
      return;
    }

    try {
      const result = await ingestVideo(file, setProgress, abort.current.signal);
      setProgress(null);
      if (result.ok) onDone(result.routine);
      else setError(result.message);
    } catch (e) {
      setProgress(null);
      if ((e as Error).name !== 'AbortError') {
        setError('Something went wrong reading that file.');
      }
    }
  };

  if (sharedFile && !progress && !error) void handle(sharedFile);

  return (
    <div className="screen">
      <header className="app-header">
        <h1>Add a routine</h1>
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </header>

      {!progress && (
        <>
          <label className="picker">
            <input
              type="file"
              accept="video/*,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handle(file);
              }}
            />
            <span className="primary block as-button">Choose a video or photo</span>
          </label>

          <div className="note">
            <h3>Quicker way</h3>
            <p>
              In TikTok, Reels or Shorts, tap <strong>Share → TrendGhost</strong> and the video
              comes straight here.{' '}
              {isIOS()
                ? 'On iPhone, save the video to your camera roll first, then pick it above.'
                : 'Install TrendGhost to your home screen to get it in the share sheet.'}
            </p>
            <p className="muted small">
              TrendGhost can't download videos from a link — that's the creator's and the platform's
              call, not ours. Everything you add stays on this device.
            </p>
          </div>
        </>
      )}

      {progress && (
        <div className="progress-card">
          <p>{progress.message}</p>
          <div className="bar">
            <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
          </div>
          <button
            className="text-button"
            onClick={() => {
              abort.current?.abort();
              setProgress(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="banner error static">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
