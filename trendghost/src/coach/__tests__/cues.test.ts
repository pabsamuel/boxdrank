import { describe, expect, it } from 'vitest';
import { CUES } from '../../config/cues.config';
import { buildTimeline } from '../../pose-core/timeline';
import { makePose } from '../../pose-core/testing';
import type { SampledFrame } from '../../pose-core/timeline';
import { CuePlayer, buildCueTrack, resolveCollisions } from '../cues';
import { segmentTimeline, velocityProfile } from '../segment';
import type { Move } from '../segment';

/** A routine: still, then the left arm sweeps up, then still again. */
function armRaiseTimeline() {
  const samples: SampledFrame[] = [];
  const fps = 30;
  const duration = 3;
  for (let i = 0; i < duration * fps; i += 1) {
    const t = i / fps;
    // Still 0-1s, sweep 1-2s, still 2-3s.
    const progress = t < 1 ? 0 : t > 2 ? 1 : t - 1;
    const upperArmL = 170 + progress * 80;
    samples.push({ t, landmarks: makePose({ upperArmL, forearmL: upperArmL }) });
  }
  return buildTimeline(samples, { id: 'test', name: 'arm raise', duration, sourceFps: fps });
}

describe('segmentation', () => {
  it('velocity is near zero while still and rises during the move', () => {
    const v = velocityProfile(armRaiseTimeline());
    const still = v[15]!;
    const moving = v[45]!;
    expect(still).toBeLessThan(0.05);
    expect(moving).toBeGreaterThan(still * 5);
  });

  it('splits the routine into moves and names the limb that drove each one', () => {
    const moves = segmentTimeline(armRaiseTimeline());
    expect(moves.length).toBeGreaterThanOrEqual(1);

    const moving = moves.find((m) => m.drivers.length > 0);
    expect(moving, 'expected at least one move with a driving limb').toBeDefined();
    expect(['upperArmL', 'forearmL']).toContain(moving!.drivers[0]!.segment);
    expect(moving!.drivers[0]!.direction).toBe('up');
  });
});

describe('cue track', () => {
  const move = (over: Partial<Move> = {}): Move => ({
    index: 0,
    startTime: 2,
    endTime: 3,
    kind: 'go',
    drivers: [{ segment: 'upperArmL', direction: 'up', delta: 80 }],
    wholeBody: [],
    peakVelocity: 0.5,
    ...over,
  });

  it('fires the go cue BEFORE the move, by the configured lead time', () => {
    const [, go] = buildCueTrack([move()]);
    expect(go!.type).toBe('go');
    expect(go!.at).toBeCloseTo(2 - CUES.leadTimeMs / 1000, 5);
    expect(go!.text).toBe('left arm up');
  });

  it('adds a quiet prepare cue further ahead', () => {
    const [prepare] = buildCueTrack([move()]);
    expect(prepare!.type).toBe('prepare');
    expect(prepare!.text).toBe('left arm up next');
    expect(prepare!.at).toBeLessThan(2 - CUES.leadTimeMs / 1000);
    expect(prepare!.voice).toBe(false);
  });

  it('a sharp move becomes "cut it", with voice and haptic', () => {
    const track = buildCueTrack([move({ kind: 'hit' })]);
    const hit = track.find((c) => c.type === 'hit');
    expect(hit?.text).toBe('cut it');
    expect(hit?.haptic).toBe(true);
  });

  it('a sustained move becomes a hold', () => {
    const track = buildCueTrack([move({ kind: 'hold' })]);
    expect(track.some((c) => c.type === 'hold')).toBe(true);
  });

  it('whole-body changes outrank a single limb', () => {
    const track = buildCueTrack([move({ wholeBody: ['crouchDown'] })]);
    expect(track.find((c) => c.type === 'go')?.text).toBe('drop low');
  });

  it('snaps to a nearby beat but not a distant one', () => {
    const near = buildCueTrack([move()], { beats: [1.6] }).find((c) => c.type === 'go');
    expect(near!.at).toBeCloseTo(1.6, 5);

    const far = buildCueTrack([move()], { beats: [0.2] }).find((c) => c.type === 'go');
    expect(far!.at).toBeCloseTo(2 - CUES.leadTimeMs / 1000, 5);
  });

  it('never shows two cues at once — the higher priority wins', () => {
    const resolved = resolveCollisions([
      { id: 'a', type: 'prepare', text: 'arms up next', at: 1.0, voice: false, haptic: false },
      { id: 'b', type: 'hit', text: 'cut it', at: 1.05, voice: true, haptic: true },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.type).toBe('hit');
  });
});

describe('CuePlayer', () => {
  const track = buildCueTrack([
    {
      index: 0,
      startTime: 2,
      endTime: 3,
      kind: 'go',
      drivers: [{ segment: 'upperArmL', direction: 'up', delta: 80 }],
      wholeBody: [],
      peakVelocity: 0.5,
    },
  ]);

  it('fires each cue once, in order, as the clock advances', () => {
    const player = new CuePlayer(track);
    expect(player.update(0)).toHaveLength(0);
    expect(player.update(0.5)).toHaveLength(1); // prepare
    expect(player.update(0.5)).toHaveLength(0); // not again
    expect(player.update(2)).toHaveLength(1); // go
  });

  it('seeking forward does not dump every skipped cue at once', () => {
    const player = new CuePlayer(track);
    // Past both cues (prepare at 0.2, go at 1.55): nothing should fire retroactively.
    player.seek(1.9);
    expect(player.update(2.0)).toHaveLength(0);
  });

  it('seeking backwards re-arms the cues after that point', () => {
    const player = new CuePlayer(track);
    player.update(3);
    player.seek(1.0);
    const fired = player.update(1.6);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.type).toBe('go');
  });

  it('corrections respect their cooldown', () => {
    const player = new CuePlayer(track);
    expect(player.maybeCorrect('left arm — a bit off', 10)).not.toBeNull();
    expect(player.maybeCorrect('left arm — a bit off', 10.5)).toBeNull();
    expect(player.maybeCorrect('left arm — a bit off', 13)).not.toBeNull();
  });
});
