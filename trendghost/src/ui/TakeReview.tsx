/**
 * Phase 8 — after a take: accuracy over time, the moments you drifted, and for
 * each of those a side-by-side of your take and the ghost with the limbs that
 * actually went wrong.
 *
 * A dip that only tells you WHEN you drifted is half an answer; the point of
 * reviewing is to find out WHAT drifted.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BAND_COLORS, BAND_COLORS_CB } from '../render/skeleton';
import { bandFor } from '../pose-core/score';
import type { SegmentId } from '../pose-core/types';
import { deleteTake, readFile, type Routine, type Take, type TakeFrame } from '../storage/db';
import { useSettings } from './useSettings';

interface Props {
  take: Take;
  routine: Routine;
  onBack: () => void;
}

/** Human names for the limbs, for the "what went wrong" list. */
const SEGMENT_LABELS: Record<SegmentId, string> = {
  upperArmL: 'left upper arm',
  upperArmR: 'right upper arm',
  forearmL: 'left forearm',
  forearmR: 'right forearm',
  thighL: 'left thigh',
  thighR: 'right thigh',
  shinL: 'left shin',
  shinR: 'right shin',
  torso: 'torso',
  head: 'head',
  footL: 'left foot',
  footR: 'right foot',
};

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

/**
 * Which limbs were worst at a moment — averaged over a short window, because a
 * single frame can be a tracking blip rather than a real mistake.
 */
export function worstLimbsAt(
  frames: TakeFrame[],
  time: number,
  windowSec = 0.4,
  count = 3,
): { segment: SegmentId; score: number }[] {
  const nearby = frames.filter((f) => Math.abs(f.t - time) <= windowSec && f.segments);
  if (nearby.length === 0) return [];

  const totals = new Map<SegmentId, { sum: number; n: number }>();
  for (const frame of nearby) {
    for (const [key, value] of Object.entries(frame.segments ?? {})) {
      const id = key as SegmentId;
      const entry = totals.get(id) ?? { sum: 0, n: 0 };
      entry.sum += value as number;
      entry.n += 1;
      totals.set(id, entry);
    }
  }

  return [...totals.entries()]
    .map(([segment, { sum, n }]) => ({ segment, score: sum / n }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count);
}

export function TakeReview({ take, routine, onBack }: Props) {
  const settings = useSettings();
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [ghostUrl, setGhostUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const takeVideo = useRef<HTMLVideoElement>(null);
  const ghostVideo = useRef<HTMLVideoElement>(null);

  const dips = useMemo(() => findDips(take.scores), [take.scores]);
  const palette = settings.colorBlind ? BAND_COLORS_CB : BAND_COLORS;

  useEffect(() => {
    const urls: string[] = [];
    void (async () => {
      const mine = await readFile(take.videoFile);
      if (mine) {
        const url = URL.createObjectURL(mine);
        urls.push(url);
        setTakeUrl(url);
      }
      if (routine.videoFile) {
        const ghost = await readFile(routine.videoFile);
        if (ghost) {
          const url = URL.createObjectURL(ghost);
          urls.push(url);
          setGhostUrl(url);
        }
      }
    })();
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [take.videoFile, routine.videoFile]);

  /** Scrub both videos to the same moment so they can be compared directly. */
  const goTo = (time: number) => {
    setSelected(time);
    if (takeVideo.current) takeVideo.current.currentTime = time;
    if (ghostVideo.current) ghostVideo.current.currentTime = time;
  };

  const limbs = selected === null ? [] : worstLimbsAt(take.scores, selected);
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

      <div className="compare">
        <figure>
          <figcaption>You</figcaption>
          {takeUrl ? (
            <video ref={takeVideo} src={takeUrl} controls playsInline />
          ) : (
            <p className="muted small">Loading your take…</p>
          )}
        </figure>
        {ghostUrl && (
          <figure>
            <figcaption>The original</figcaption>
            <video ref={ghostVideo} src={ghostUrl} controls playsInline muted />
          </figure>
        )}
      </div>

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
        <p className="muted small">
          {dips.length > 0
            ? 'Accuracy through the take. Tap a moment below to see it side by side.'
            : 'Accuracy through the take.'}
        </p>
      </div>

      {dips.length > 0 && (
        <div className="dip-list">
          {dips.map((dip) => (
            <button
              key={dip.t}
              className={selected === dip.t ? 'chip active' : 'chip'}
              onClick={() => goTo(dip.t)}
            >
              {dip.t.toFixed(1)}s · {Math.round(dip.score * 100)}%
            </button>
          ))}
        </div>
      )}

      {selected !== null && limbs.length > 0 && (
        <div className="graph-card">
          <h2>At {selected.toFixed(1)}s</h2>
          <ul className="limb-list">
            {limbs.map(({ segment, score }) => (
              <li key={segment}>
                <span className="swatch" style={{ background: palette[bandFor(score)] }} />
                {SEGMENT_LABELS[segment]}
                <strong>{Math.round(score * 100)}%</strong>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Worst limbs around this moment. Both videos above are scrubbed here.
          </p>
        </div>
      )}

      <div className="row">
        {takeUrl && (
          <a className="as-button" href={takeUrl} download={`${routine.name}-take.webm`}>
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
