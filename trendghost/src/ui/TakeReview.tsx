/**
 * Phase 8 — after a take: accuracy over time, with the worst moments marked.
 * Tap a dip to jump both your take and the ghost to that moment.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteTake, readFile, type Routine, type Take } from '../storage/db';

interface Props {
  take: Take;
  routine: Routine;
  onBack: () => void;
}

/** The 3 worst sustained dips, so we point at moments rather than single frames. */
export function findDips(
  scores: { t: number; score: number | null }[],
  count = 3,
  windowSec = 0.5,
): { t: number; score: number }[] {
  const scored = scores.filter((s): s is { t: number; score: number } => s.score !== null);
  if (scored.length === 0) return [];

  const averaged = scored.map((point, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j < scored.length && scored[j]!.t - point.t <= windowSec; j += 1) {
      sum += scored[j]!.score;
      n += 1;
    }
    return { t: point.t, score: n === 0 ? point.score : sum / n };
  });

  const picked: { t: number; score: number }[] = [];
  for (const candidate of [...averaged].sort((a, b) => a.score - b.score)) {
    if (picked.length >= count) break;
    // Don't report the same dip three times.
    if (picked.some((p) => Math.abs(p.t - candidate.t) < windowSec * 3)) continue;
    picked.push(candidate);
  }
  return picked.sort((a, b) => a.t - b.t);
}

export function TakeReview({ take, routine, onBack }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dips = useMemo(() => findDips(take.scores), [take.scores]);

  useEffect(() => {
    let objectUrl: string | null = null;
    void readFile(take.videoFile).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [take.videoFile]);

  const points = take.scores.filter((s) => s.score !== null);
  const path = points
    .map((point, i) => {
      const x = (point.t / Math.max(take.duration, 0.001)) * 100;
      const y = 100 - (point.score ?? 0) * 100;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <div className="screen">
      <header className="app-header">
        <h1>{Math.round(take.accuracy * 100)}% match</h1>
        <button className="text-button" onClick={onBack}>
          Done
        </button>
      </header>

      {url ? (
        <video ref={videoRef} className="take-video" src={url} controls playsInline />
      ) : (
        <p className="muted">Loading your take…</p>
      )}

      <div className="graph-card">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="graph">
          <line x1="0" y1="25" x2="100" y2="25" className="grid" />
          <path d={path} className="line" />
          {dips.map((dip) => (
            <circle
              key={dip.t}
              cx={(dip.t / Math.max(take.duration, 0.001)) * 100}
              cy={100 - dip.score * 100}
              r="2.5"
              className="dip"
            />
          ))}
        </svg>
        <p className="muted small">Accuracy through the take. The dots are where you drifted.</p>
      </div>

      {dips.length > 0 && (
        <div className="dip-list">
          {dips.map((dip) => (
            <button
              key={dip.t}
              className="chip"
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = dip.t;
              }}
            >
              {dip.t.toFixed(1)}s · {Math.round(dip.score * 100)}%
            </button>
          ))}
        </div>
      )}

      <div className="row">
        {url && (
          <a className="as-button" href={url} download={`${routine.name}-take.webm`}>
            Save to my phone
          </a>
        )}
        <button
          className="text-button danger"
          onClick={async () => {
            await deleteTake(take.id);
            onBack();
          }}
        >
          Delete take
        </button>
      </div>
    </div>
  );
}
