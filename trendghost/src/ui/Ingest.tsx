/**
 * Adding a routine. Two lanes only: share sheet and file picker
 * (CONTENT_SOURCING.md). There is no URL field, by design.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ingestPhoto } from '../ingest/ingestPhoto';
import { ingestVideo, type IngestProgress } from '../ingest/ingestVideo';
import type { Routine } from '../storage/db';

interface Props {
  onDone: (routine: Routine) => void;
  onCancel: () => void;
  /** A file handed to us by the OS share sheet, if that's how we got here. */
  sharedFile?: File | null;
  /** A link shared instead of a file — see the panel below. */
  sharedLink?: string | null;
}

export function Ingest({ onDone, onCancel, sharedFile, sharedLink }: Props) {
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const handle = useCallback(async (file: File) => {
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
  }, []);

  // A file arriving from the share sheet starts processing by itself — that is
  // the whole point of the share flow: tap share, and it's already working.
  const started = useRef(false);
  useEffect(() => {
    if (!sharedFile || started.current) return;
    started.current = true;
    void handle(sharedFile);
  }, [sharedFile, handle]);

  return (
    <div className="screen">
      <header className="app-header">
        <h1>Add a routine</h1>
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </header>

      {!progress && sharedLink && (
        <div className="banner static">
          <h3>That came through as a link, not the video</h3>
          <p>
            TikTok, Reels and Shorts only hand other apps a link — they keep the video file. A link
            is no use here: TrendGhost reads the movement out of the actual frames, and it never
            fetches anything from the internet.
          </p>
          <p>
            <strong>Save the video first, then it works in one tap:</strong> in TikTok tap{' '}
            <strong>Share → Save video</strong>, then either share it again from your gallery, or
            pick it below.
          </p>
          <p className="muted small">Shared: {sharedLink}</p>
        </div>
      )}

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
            <h3>Quicker way: share it from your gallery</h3>
            <p>
              Anything already on your phone — camera roll, gallery, a saved video — can be sent
              straight here with <strong>Share → TrendGhost</strong>, and it starts loading by
              itself.
            </p>
            <p>
              Straight from TikTok, Reels or Shorts it doesn't work: those apps pass a link and keep
              the video. Tap <strong>Save video</strong> there first.
            </p>
            <p className="muted small">
              {isIOS()
                ? "On iPhone that isn't available in the browser yet: save the video to your camera roll first, then pick it above."
                : installed()
                  ? 'TrendGhost is installed, so it should already be in your share sheet.'
                  : 'Add TrendGhost to your home screen first — that is what puts it in the share sheet.'}
            </p>
            <p className="muted small">
              TrendGhost can't fetch a video from a link — that's the creator's and the platform's
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

/** Running as an installed app, which is when the share target is registered. */
function installed(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}
