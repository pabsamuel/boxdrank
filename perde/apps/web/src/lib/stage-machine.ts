import {
  emptyProgress,
  flattenLines,
  isCustomPuppet,
  matchLine,
  NEUTRAL_POSE,
  PLAYER_SEATS,
  PuppetSchema,
  type CulturePack,
  type FlatLine,
  type FromControllerMsg,
  type Gesture,
  type Plan,
  type Play,
  type Pose,
  type Puppet,
  type SeatInfo,
  type StageState,
  onStageAt,
  StageStateSchema,
} from '@perde/shared';
import { getPack, isUnlocked, packs } from '@perde/content';

/**
 * The stage's brain: a pure reducer over controller events. It owns seats,
 * the running play, karaoke progress and speech matching. React only renders
 * what comes out of it, which keeps the whole game logic unit-testable.
 */

export interface GestureEvent {
  gesture: Gesture;
  at: number;
}

export interface StageModel {
  state: StageState;
  pack: CulturePack;
  play: Play | null;
  lines: FlatLine[];
  poses: Record<string, Pose>;
  gestures: Record<string, GestureEvent>;
  /** seat id → character id for the running play */
  casting: Record<string, string>;
  /** Names players typed on their phones, kept across plays. */
  names: Record<string, string>;
  hostSeat: string | null;
  /** Puppets the family drew and sent from their phones (image data inside). */
  custom: Puppet[];
}

export type StageEvent =
  | { type: 'joined'; seat: string; name?: string; at: number }
  | { type: 'left'; seat: string }
  /** The relay's greeting after (re)connecting: who is on the phones right now. */
  | { type: 'welcome'; peers: Array<{ seat: string; name?: string }>; at: number }
  /** A reloaded TV picks its room back up from a saved snapshot. */
  | { type: 'restore'; snapshot: unknown }
  | { type: 'plan'; plan: Plan; notice?: string; checkoutUrl?: string }
  | { type: 'notice'; notice?: string }
  | { type: 'msg'; msg: FromControllerMsg; at: number }
  | {
      type: 'local';
      action:
        'next' | 'prev' | 'toggle-karaoke' | 'lobby' | 'free-play' | 'set-culture' | 'auto-advance';
      cultureId?: string;
      at: number;
    };

/** Find a puppet in the culture pack or among the family's own. */
export function findPuppet(model: StageModel, puppetId: string): Puppet | undefined {
  return (
    model.pack.puppets.find((p) => p.id === puppetId) ?? model.custom.find((p) => p.id === puppetId)
  );
}

function seatsFor(
  pack: CulturePack,
  prev: SeatInfo[] | undefined,
  names: Record<string, string>,
  hostSeat: string | null,
): SeatInfo[] {
  return PLAYER_SEATS.map((id, i) => {
    const def = pack.culture.defaultSeats[i] ?? pack.culture.defaultSeats[0]!;
    const puppet = pack.puppets.find((p) => p.id === def.puppetId) ?? pack.puppets[0]!;
    const old = prev?.find((s) => s.id === id);
    return {
      id,
      name: names[id] ?? puppet.name,
      puppetId: puppet.id,
      puppetName: puppet.name,
      color: puppet.color,
      connected: old?.connected ?? false,
      isHost: hostSeat === id,
    };
  });
}

export function createStageModel(cultureId = 'tr', plan: Plan = 'free'): StageModel {
  const pack = getPack(cultureId) ?? packs[0]!;
  const names: Record<string, string> = {};
  const seats = seatsFor(pack, undefined, names, null);
  return {
    state: {
      mode: 'lobby',
      cultureId: pack.culture.id,
      karaoke: true,
      leniency: 'kids',
      plan,
      voice: true,
      sound: true,
      seats,
      customPuppets: [],
      play: null,
    },
    pack,
    play: null,
    lines: [],
    poses: {},
    gestures: {},
    casting: {},
    names,
    hostSeat: null,
    custom: [],
  };
}

/**
 * What a TV needs to pick a room back up after a reload: the broadcast state
 * plus the casting and names behind it. Poses and gestures are ephemeral and
 * custom puppet images are big, so neither is saved; phones re-send both.
 */
export interface StageSnapshot {
  v: 1;
  code: string;
  state: StageState;
  casting: Record<string, string>;
  names: Record<string, string>;
  hostSeat: string | null;
}

export function snapshotModel(model: StageModel, code: string): StageSnapshot {
  return {
    v: 1,
    code,
    state: { ...model.state, customPuppets: [] },
    casting: model.casting,
    names: model.names,
    hostSeat: model.hostSeat,
  };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string')
  );
}

/** The schema lives in shared; the app-side fields are checked by hand (no zod in the app). */
function parseSnapshot(v: unknown): StageSnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || typeof o.code !== 'string') return null;
  const state = StageStateSchema.safeParse(o.state);
  if (!state.success) return null;
  if (!isStringRecord(o.casting) || !isStringRecord(o.names)) return null;
  if (o.hostSeat !== null && typeof o.hostSeat !== 'string') return null;
  return {
    v: 1,
    code: o.code,
    state: state.data,
    casting: o.casting,
    names: o.names,
    hostSeat: o.hostSeat,
  };
}

/**
 * Rebuild a model from a snapshot. Every seat comes back disconnected: the
 * relay's welcome says who is really there. Returns null for junk.
 */
export function restoreModel(snapshot: unknown, plan: Plan): StageModel | null {
  const snap = parseSnapshot(snapshot);
  if (!snap) return null;
  const pack = getPack(snap.state.cultureId);
  if (!pack) return null;
  const play = snap.state.play
    ? (pack.plays.find((p) => p.id === snap.state.play?.id) ?? null)
    : null;
  if (snap.state.play && !play) return null;
  const seats = snap.state.seats.map((seat) => ({ ...seat, connected: false, isHost: false }));
  return {
    state: { ...snap.state, plan, seats, customPuppets: [], notice: undefined },
    pack,
    play,
    lines: play ? flattenLines(play) : [],
    poses: {},
    gestures: {},
    casting: play ? snap.casting : {},
    names: snap.names,
    hostSeat: snap.hostSeat,
    custom: [],
  };
}

type CurrentLine = NonNullable<StageState['play']>['line'];

function lineAt(model: StageModel, index: number): CurrentLine {
  const play = model.play!;
  const flat = model.lines[index];
  if (!flat) return null;
  const seatFor = Object.entries(model.casting).find(([, ch]) => ch === flat.line.seat)?.[0];
  const speaker = play.characters.find((c) => c.seat === flat.line.seat)?.name ?? '';
  return {
    seat: seatFor,
    character: flat.line.seat,
    speaker,
    text: flat.line.text,
    hint: flat.line.hint,
    song: flat.line.song,
  };
}

function withState(model: StageModel, patch: Partial<StageState>): StageModel {
  return { ...model, state: { ...model.state, ...patch } };
}

function playState(
  model: StageModel,
  lineIndex: number,
  progress: NonNullable<StageState['play']>['progress'],
  spokenLines: number,
  finished: boolean,
): StageState['play'] {
  const play = model.play!;
  const flat = model.lines[lineIndex];
  return {
    id: play.id,
    title: play.title,
    sectionTitle: flat?.sectionTitle ?? '',
    lineIndex,
    totalLines: model.lines.length,
    line: lineAt(model, lineIndex),
    next: lineAt(model, lineIndex + 1),
    progress,
    finished,
    spokenLines,
  };
}

function gotoLine(model: StageModel, lineIndex: number, spokenLines: number): StageModel {
  const total = model.lines.length;
  const idx = Math.max(0, Math.min(lineIndex, total));
  const finished = idx >= total;
  const flat = model.lines[idx];
  const progress = flat ? emptyProgress(flat.line.text) : null;
  const next = withState(model, { play: playState(model, idx, progress, spokenLines, finished) });
  if (flat?.line.gesture) {
    const seat =
      Object.entries(model.casting).find(([, ch]) => ch === flat.line.seat)?.[0] ??
      `npc:${flat.line.seat}`;
    return {
      ...next,
      gestures: { ...next.gestures, [seat]: { gesture: flat.line.gesture, at: Date.now() } },
    };
  }
  return next;
}

/** Bind play characters to seats: same puppet first, then any connected seat, the rest are unclaimed. */
export function castPlay(
  play: Play,
  seats: SeatInfo[],
): { casting: Record<string, string>; seats: SeatInfo[] } {
  const casting: Record<string, string> = {};
  const connected = seats.filter((s) => s.connected);
  const taken = new Set<string>();
  for (const ch of play.characters) {
    const seat = connected.find((s) => !taken.has(s.id) && s.puppetId === ch.puppetId);
    if (seat) {
      casting[seat.id] = ch.seat;
      taken.add(seat.id);
    }
  }
  for (const ch of play.characters) {
    if (Object.values(casting).includes(ch.seat)) continue;
    const seat = connected.find((s) => !taken.has(s.id));
    if (seat) {
      casting[seat.id] = ch.seat;
      taken.add(seat.id);
    }
  }
  const pack = getPack(play.cultureId)!;
  const nextSeats = seats.map((s) => {
    const ch = casting[s.id];
    if (!ch) return { ...s, character: undefined };
    const c = play.characters.find((x) => x.seat === ch)!;
    // A family's own drawing keeps playing the part; only pack puppets are swapped.
    if (isCustomPuppet(s.puppetId)) return { ...s, character: ch, color: c.color ?? s.color };
    const puppet = pack.puppets.find((p) => p.id === c.puppetId)!;
    return {
      ...s,
      character: ch,
      puppetId: puppet.id,
      puppetName: puppet.name,
      color: c.color ?? puppet.color,
    };
  });
  return { casting, seats: nextSeats };
}

/** Add or replace a puppet the family drew; its sender starts holding it. */
function addCustomPuppet(model: StageModel, seat: string, raw: unknown): StageModel {
  const parsed = PuppetSchema.safeParse(raw);
  if (!parsed.success || !isCustomPuppet(parsed.data.id)) return model;
  const puppet = parsed.data;
  const custom = [...model.custom.filter((p) => p.id !== puppet.id), puppet].slice(-12);
  const customPuppets = custom.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.id === puppet.id ? seat : model.state.customPuppets?.find((c) => c.id === p.id)?.seat,
  }));
  const seats = model.state.seats.map((s) =>
    s.id === seat ? { ...s, puppetId: puppet.id, puppetName: puppet.name, color: puppet.color } : s,
  );
  return { ...model, custom, state: { ...model.state, customPuppets, seats, notice: undefined } };
}

function startPlay(model: StageModel, playId: string | undefined): StageModel {
  const play = model.pack.plays.find((p) => p.id === playId);
  if (!play) return model;
  if (!isUnlocked(play, model.state.plan)) return withState(model, { notice: 'locked' });
  const { casting, seats } = castPlay(play, model.state.seats);
  const lines = flattenLines(play);
  const next: StageModel = {
    ...model,
    play,
    lines,
    casting,
    state: { ...model.state, mode: 'play', seats, notice: undefined },
  };
  return gotoLine(next, 0, 0);
}

function setCulture(model: StageModel, cultureId: string | undefined): StageModel {
  const pack = getPack(cultureId ?? '');
  if (!pack) return model;
  if (!isUnlocked(pack.culture, model.state.plan)) return withState(model, { notice: 'locked' });
  const seats = seatsFor(pack, model.state.seats, model.names, model.hostSeat);
  return {
    ...model,
    pack,
    play: null,
    lines: [],
    casting: {},
    state: {
      ...model.state,
      cultureId: pack.culture.id,
      mode: model.state.mode === 'play' ? 'free' : model.state.mode,
      seats,
      play: null,
      notice: undefined,
    },
  };
}

function setPuppet(model: StageModel, seat: string, puppetId: string | undefined): StageModel {
  const puppet = puppetId ? findPuppet(model, puppetId) : undefined;
  if (!puppet) return model;
  if (!isUnlocked(puppet, model.state.plan)) return withState(model, { notice: 'locked' });
  const seats = model.state.seats.map((s) =>
    s.id === seat
      ? {
          ...s,
          puppetId: puppet.id,
          puppetName: puppet.name,
          color: puppet.color,
          name: model.names[s.id] ?? puppet.name,
        }
      : s,
  );
  return withState(model, { seats, notice: undefined });
}

function applySpeech(
  model: StageModel,
  seat: string,
  transcript: string,
  lineIndex: number | undefined,
  at: number,
): StageModel {
  const ps = model.state.play;
  if (!ps || ps.finished || !ps.line || !model.play) return model;
  if (lineIndex !== undefined && lineIndex !== ps.lineIndex) return model;
  // Only the seat cast for this line may voice it; unclaimed characters accept anyone.
  if (ps.line.seat && ps.line.seat !== seat) return model;
  const result = matchLine(ps.line.text, transcript, {
    lang: model.play.lang,
    leniency: model.state.leniency,
    song: ps.line.song,
  });
  const progress = { tokens: result.tokens, ratio: result.ratio, passed: result.passed };
  const talkingSeat = ps.line.seat ?? `npc:${ps.line.character}`;
  const poses = {
    ...model.poses,
    [talkingSeat]: { ...(model.poses[talkingSeat] ?? NEUTRAL_POSE), talking: true },
  };
  const updated: StageModel = {
    ...model,
    poses,
    state: { ...model.state, play: { ...ps, progress } },
  };
  if (result.passed) {
    const advanced = gotoLine(updated, ps.lineIndex + 1, ps.spokenLines + 1);
    // A little nod for a line well said, unless the next line already triggered a gesture.
    const g = advanced.gestures[talkingSeat];
    return g && g.at === Date.now()
      ? advanced
      : { ...advanced, gestures: { ...advanced.gestures, [talkingSeat]: { gesture: 'nod', at } } };
  }
  return updated;
}

export function reduceStage(model: StageModel, ev: StageEvent): StageModel {
  switch (ev.type) {
    case 'joined': {
      if (!PLAYER_SEATS.includes(ev.seat as (typeof PLAYER_SEATS)[number])) return model;
      const hostSeat =
        model.hostSeat && model.state.seats.find((s) => s.id === model.hostSeat)?.connected
          ? model.hostSeat
          : ev.seat;
      const names = ev.name ? { ...model.names, [ev.seat]: ev.name } : model.names;
      const seats = model.state.seats
        .map((s) =>
          s.id === ev.seat ? { ...s, connected: true, name: names[s.id] ?? s.puppetName } : s,
        )
        .map((s) => ({ ...s, isHost: s.id === hostSeat }));
      const mode = model.state.mode === 'lobby' ? 'free' : model.state.mode;
      return {
        ...model,
        hostSeat,
        names,
        poses: { ...model.poses, [ev.seat]: model.poses[ev.seat] ?? NEUTRAL_POSE },
        state: { ...model.state, seats, mode },
      };
    }
    case 'welcome': {
      let next = model;
      for (const p of ev.peers)
        next = reduceStage(next, { type: 'joined', seat: p.seat, name: p.name, at: ev.at });
      if (next.state.seats.some((s) => s.connected)) return next;
      // Nobody is holding a rod: whatever was running is over.
      return {
        ...next,
        hostSeat: null,
        play: null,
        lines: [],
        casting: {},
        state: { ...next.state, mode: 'lobby', play: null },
      };
    }
    case 'restore':
      return restoreModel(ev.snapshot, model.state.plan) ?? model;
    case 'left': {
      const seats = model.state.seats.map((s) =>
        s.id === ev.seat ? { ...s, connected: false } : s,
      );
      let hostSeat = model.hostSeat;
      if (hostSeat === ev.seat) hostSeat = seats.find((s) => s.connected)?.id ?? null;
      const withHost = seats.map((s) => ({ ...s, isHost: s.id === hostSeat }));
      const anyone = withHost.some((s) => s.connected);
      const mode = anyone ? model.state.mode : 'lobby';
      return {
        ...model,
        hostSeat,
        state: { ...model.state, seats: withHost, mode, play: anyone ? model.state.play : null },
        play: anyone ? model.play : null,
        lines: anyone ? model.lines : [],
      };
    }
    case 'plan':
      return withState(model, {
        plan: ev.plan,
        notice: ev.notice,
        checkoutUrl: ev.checkoutUrl ?? model.state.checkoutUrl,
      });
    case 'notice':
      return withState(model, { notice: ev.notice });
    case 'local':
      return reduceControl(model, 'local', ev.action, {}, ev.at, ev.cultureId);
    case 'msg': {
      const m = ev.msg;
      switch (m.t) {
        case 'pose':
          return { ...model, poses: { ...model.poses, [m.seat]: m.pose } };
        case 'gesture':
          return {
            ...model,
            gestures: { ...model.gestures, [m.seat]: { gesture: m.gesture, at: ev.at } },
          };
        case 'speech':
          return applySpeech(model, m.seat, m.transcript, m.lineIndex, ev.at);
        case 'control':
          return reduceControl(model, m.seat, m.action, m, ev.at, m.cultureId);
        case 'puppet':
          return addCustomPuppet(model, m.seat, m.puppet);
      }
    }
  }
  return model;
}

type ControlExtras = {
  playId?: string;
  puppetId?: string;
  leniency?: StageState['leniency'];
  licenseKey?: string;
};

function reduceControl(
  model: StageModel,
  seat: string,
  action: string,
  extras: ControlExtras,
  _at: number,
  cultureId?: string,
): StageModel {
  const ps = model.state.play;
  switch (action) {
    case 'next':
      return ps && !ps.finished ? gotoLine(model, ps.lineIndex + 1, ps.spokenLines) : model;
    case 'prev':
      return ps ? gotoLine(model, Math.max(0, ps.lineIndex - 1), ps.spokenLines) : model;
    case 'said-it':
    case 'auto-advance':
      return ps && !ps.finished ? gotoLine(model, ps.lineIndex + 1, ps.spokenLines) : model;
    case 'toggle-voice':
      return withState(model, { voice: !(model.state.voice ?? true) });
    case 'toggle-sound':
      return withState(model, { sound: !(model.state.sound ?? true) });
    case 'start-play':
      return startPlay(model, extras.playId);
    case 'free-play':
      return {
        ...model,
        play: null,
        lines: [],
        casting: {},
        state: {
          ...model.state,
          mode: 'free',
          play: null,
          seats: model.state.seats.map((s) => ({ ...s, character: undefined })),
        },
      };
    case 'lobby':
      return {
        ...model,
        play: null,
        lines: [],
        casting: {},
        state: {
          ...model.state,
          mode: model.state.seats.some((s) => s.connected) ? 'free' : 'lobby',
          play: null,
        },
      };
    case 'toggle-karaoke':
      return withState(model, { karaoke: !model.state.karaoke });
    case 'set-culture':
      return setCulture(model, cultureId);
    case 'set-puppet':
      return seat === 'local' ? model : setPuppet(model, seat, extras.puppetId);
    case 'set-leniency':
      return extras.leniency ? withState(model, { leniency: extras.leniency }) : model;
    default:
      return model;
  }
}

/** Puppets to draw: connected seats, plus unclaimed play characters that speak in the current section. */
export interface VisiblePuppet {
  key: string;
  puppetId: string;
  color: string;
  npc: boolean;
  /** Preferred x when no controller drives it. */
  slot: number;
  speaking: boolean;
  /** Waiting in the wing: its character has not entered the current section yet. */
  offstage: boolean;
  entrance?: 'walk' | 'drop';
}

export function visiblePuppets(model: StageModel): VisiblePuppet[] {
  const out: VisiblePuppet[] = [];
  const ps = model.state.play;
  const currentChar = ps?.line?.character;
  const inPlay = !!ps && !!model.play && !ps.finished;
  const entranceOf = (seat: string | undefined) =>
    model.play?.characters.find((c) => c.seat === seat)?.entrance;
  model.state.seats.forEach((s, i) => {
    if (s.connected)
      out.push({
        key: s.id,
        puppetId: s.puppetId,
        color: s.color,
        npc: false,
        slot: i,
        speaking: s.character === currentChar && !!currentChar,
        offstage: inPlay && !!s.character && !onStageAt(model.lines, s.character, ps.lineIndex),
        entrance: entranceOf(s.character),
      });
  });
  if (inPlay && model.play) {
    model.play.characters.forEach((c, i) => {
      if (Object.values(model.casting).includes(c.seat)) return;
      const puppet = findPuppet(model, c.puppetId);
      if (!puppet) return;
      out.push({
        key: `npc:${c.seat}`,
        puppetId: puppet.id,
        color: c.color ?? puppet.color,
        npc: true,
        slot: 4 + i,
        speaking: c.seat === currentChar,
        offstage: !onStageAt(model.lines, c.seat, ps.lineIndex),
        entrance: c.entrance,
      });
    });
  }
  return out;
}
