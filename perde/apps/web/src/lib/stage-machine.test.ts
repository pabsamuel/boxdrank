import { describe, expect, it } from 'vitest';
import {
  castPlay,
  createStageModel,
  reduceStage,
  visiblePuppets,
  type StageModel,
} from './stage-machine';

const t0 = 1_000;
const join = (m: StageModel, seat: string, name?: string) =>
  reduceStage(m, { type: 'joined', seat, name, at: t0 });
const ctl = (m: StageModel, seat: string, action: string, extra: Record<string, unknown> = {}) =>
  reduceStage(m, { type: 'msg', msg: { t: 'control', seat, action, ...extra } as never, at: t0 });
const speak = (m: StageModel, seat: string, transcript: string, lineIndex?: number) =>
  reduceStage(m, {
    type: 'msg',
    msg: { t: 'speech', seat, transcript, final: false, lineIndex },
    at: t0,
  });

describe('stage machine', () => {
  it('starts in the lobby with the Turkish default seats', () => {
    const m = createStageModel();
    expect(m.state.mode).toBe('lobby');
    expect(m.state.seats.map((s) => s.puppetId)).toEqual(['karagoz', 'hacivat', 'celebi', 'zenne']);
    expect(m.state.seats.every((s) => !s.connected)).toBe(true);
  });

  it('first phone becomes host and the stage leaves the lobby', () => {
    let m = join(createStageModel(), 'p1', 'Baba');
    expect(m.state.mode).toBe('free');
    expect(m.state.seats[0]).toMatchObject({ connected: true, isHost: true, name: 'Baba' });
    m = join(m, 'p2');
    expect(m.state.seats[1]).toMatchObject({ connected: true, isHost: false, name: 'Hacivat' });
    m = reduceStage(m, { type: 'left', seat: 'p1' });
    expect(m.state.seats[1]!.isHost).toBe(true);
    m = reduceStage(m, { type: 'left', seat: 'p2' });
    expect(m.state.mode).toBe('lobby');
  });

  it('ignores seats outside p1..p4', () => {
    const m = join(createStageModel(), 'hacker');
    expect(m.state.mode).toBe('lobby');
  });

  it('casts a play by puppet, then fills, then leaves the rest unclaimed', () => {
    let m = join(join(createStageModel(), 'p1'), 'p2');
    m = ctl(m, 'p2', 'set-puppet', { puppetId: 'karagoz' });
    m = ctl(m, 'p1', 'start-play', { playId: 'salincak' });
    expect(m.state.mode).toBe('play');
    // Both seats hold Karagöz; the first connected seat keeps him, p2 is recast as Hacivat.
    expect(m.casting).toEqual({ p1: 'karagoz', p2: 'hacivat' });
    expect(m.state.seats[1]!.puppetId).toBe('hacivat');
    const visible = visiblePuppets(m);
    expect(visible.filter((v) => !v.npc)).toHaveLength(2);
    // Section 1 of Salıncak has only Karagöz and Hacivat lines: no NPC yet.
    expect(visible.filter((v) => v.npc)).toHaveLength(0);
  });

  it('advances lines by speech, only for the cast seat, dropping stale transcripts', () => {
    let m = join(join(createStageModel(), 'p1'), 'p2');
    m = ctl(m, 'p1', 'start-play', { playId: 'giris' });
    // p1 = Karagöz, p2 = Hacivat; line 0 is Hacivat's song.
    expect(m.state.play?.line).toMatchObject({ seat: 'p2', character: 'hacivat', song: true });
    m = speak(m, 'p1', 'perde kuruldu mumlar yandı', 0);
    expect(m.state.play?.lineIndex).toBe(0);
    expect(m.state.play?.progress?.ratio).toBe(0);
    m = speak(m, 'p2', 'perde kuruldu', 0);
    expect(m.state.play?.progress?.tokens.slice(0, 2).every((t) => t.matched)).toBe(true);
    m = speak(m, 'p2', 'perde kuruldu mumlar yandı gel', 0);
    expect(m.state.play?.lineIndex).toBe(1);
    expect(m.state.play?.spokenLines).toBe(1);
    // A transcript tagged with the old line index is ignored.
    const before = m;
    m = speak(m, 'p2', 'off hay hak', 0);
    expect(m.state.play?.lineIndex).toBe(before.state.play?.lineIndex);
    m = speak(m, 'p2', 'off hay hak', 1);
    expect(m.state.play?.lineIndex).toBe(2);
  });

  it('lets anyone voice an unclaimed character and counts manual skips separately', () => {
    let m = join(createStageModel(), 'p1');
    m = ctl(m, 'p1', 'start-play', { playId: 'giris' });
    // Only one phone: Hacivat is unclaimed, so p1 may voice Hacivat's lines.
    expect(m.state.play?.line?.seat).toBeUndefined();
    m = speak(m, 'p1', 'perde kuruldu mumlar yandı gel karagözüm gel', 0);
    expect(m.state.play?.lineIndex).toBe(1);
    m = ctl(m, 'p1', 'said-it');
    expect(m.state.play?.lineIndex).toBe(2);
    expect(m.state.play?.spokenLines).toBe(1);
    expect(visiblePuppets(m).some((v) => v.key === 'npc:hacivat')).toBe(true);
  });

  it('finishes and returns to free play', () => {
    let m = join(join(createStageModel(), 'p1'), 'p2');
    m = ctl(m, 'p1', 'start-play', { playId: 'giris' });
    const total = m.state.play!.totalLines;
    for (let i = 0; i < total; i++) m = ctl(m, 'p1', 'next');
    expect(m.state.play?.finished).toBe(true);
    m = ctl(m, 'p1', 'next');
    expect(m.state.play?.lineIndex).toBe(total);
    m = ctl(m, 'p1', 'lobby');
    expect(m.state.mode).toBe('free');
    expect(m.state.play).toBeNull();
  });

  it('locks premium content on the free plan and unlocks on plus', () => {
    let m = join(createStageModel('tr', 'free'), 'p1');
    m = ctl(m, 'p1', 'start-play', { playId: 'kayik' });
    expect(m.state.mode).toBe('free');
    expect(m.state.notice).toBe('locked');
    m = ctl(m, 'p1', 'set-culture', { cultureId: 'en' });
    expect(m.state.cultureId).toBe('tr');
    m = reduceStage(m, { type: 'plan', plan: 'plus' });
    m = ctl(m, 'p1', 'set-culture', { cultureId: 'en' });
    expect(m.state.cultureId).toBe('en');
    expect(m.state.seats[0]!.puppetId).toBe('punch');
    m = ctl(m, 'p1', 'start-play', { playId: 'sausages' });
    expect(m.state.mode).toBe('play');
  });

  it('keeps a family drawing on its seat when a play is cast, and offers it to the sender', () => {
    let m = join(join(createStageModel(), 'p1'), 'p2');
    const drawing = {
      id: 'custom:kedi',
      cultureId: 'atelier',
      name: 'Kedi',
      description: 'Drawn at home.',
      width: 100,
      height: 200,
      image: 'data:image/png;base64,AAAA',
      color: '#f2c94c',
      rod: [50, 40],
      parts: [
        {
          id: 'body',
          polygon: [
            [0, 0],
            [100, 0],
            [100, 200],
            [0, 200],
          ],
          pivot: [50, 40],
          driver: 'lean',
          gain: 2,
        },
        {
          id: 'arm',
          polygon: [
            [60, 50],
            [95, 50],
            [95, 60],
            [60, 60],
          ],
          parent: 'body',
          pivot: [60, 55],
          driver: 'arm',
          gain: -100,
        },
      ],
    };
    m = reduceStage(m, { type: 'msg', msg: { t: 'puppet', seat: 'p2', puppet: drawing }, at: t0 });
    expect(m.custom.map((p) => p.id)).toEqual(['custom:kedi']);
    expect(m.state.customPuppets).toEqual([{ id: 'custom:kedi', name: 'Kedi', seat: 'p2' }]);
    expect(m.state.seats[1]!.puppetId).toBe('custom:kedi');
    m = ctl(m, 'p1', 'start-play', { playId: 'giris' });
    // p1 keeps Karagöz; p2's cat plays Hacivat instead of being swapped for the Hacivat rig.
    expect(m.casting).toEqual({ p1: 'karagoz', p2: 'hacivat' });
    expect(m.state.seats[1]!.puppetId).toBe('custom:kedi');
    expect(visiblePuppets(m).map((v) => v.puppetId)).toContain('custom:kedi');
    // Garbage is ignored.
    const before = m;
    m = reduceStage(m, {
      type: 'msg',
      msg: { t: 'puppet', seat: 'p2', puppet: { nope: true } },
      at: t0,
    });
    expect(m).toBe(before);
  });

  it('exposes the next line and lets the TV auto-advance unclaimed lines', () => {
    let m = join(createStageModel(), 'p1');
    m = ctl(m, 'p1', 'start-play', { playId: 'giris' });
    expect(m.state.play?.next?.text).toContain('Off');
    expect(m.state.voice).toBe(true);
    m = reduceStage(m, { type: 'local', action: 'auto-advance', at: t0 });
    expect(m.state.play?.lineIndex).toBe(1);
    expect(m.state.play?.spokenLines).toBe(0);
    m = ctl(m, 'p1', 'toggle-voice');
    expect(m.state.voice).toBe(false);
    expect(m.state.sound).toBe(true);
    m = ctl(m, 'p1', 'toggle-sound');
    expect(m.state.sound).toBe(false);
  });

  it('castPlay prefers matching puppets', () => {
    const m = join(join(createStageModel(), 'p1'), 'p2');
    const play = m.pack.plays.find((p) => p.id === 'giris')!;
    const { casting } = castPlay(play, m.state.seats);
    expect(casting).toEqual({ p2: 'hacivat', p1: 'karagoz' });
  });
});
