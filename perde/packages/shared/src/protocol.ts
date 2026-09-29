import { z } from 'zod';

/**
 * Wire protocol between the three parties of a room:
 *
 *   phone (controller)  ──►  relay  ──►  TV (stage)
 *   TV (stage)          ──►  relay  ──►  every phone
 *
 * The relay never interprets puppet data; it only stamps controller messages
 * with the sender's seat and fans them out. All game logic lives on the stage.
 */

export const GESTURES = ['none', 'wave', 'jump', 'spin', 'bow', 'nod', 'shake'] as const;
export const GestureSchema = z.enum(GESTURES);
export type Gesture = z.infer<typeof GestureSchema>;

/** A puppet's pose, every axis normalised to -1..1. */
export const PoseSchema = z.object({
  /** Horizontal position across the stage: -1 far left, 1 far right. */
  x: z.number().min(-1).max(1),
  /** Vertical bob: 0 on the ground, 1 a full hop. */
  y: z.number().min(-1).max(1),
  /** Body lean: -1 leaning left, 1 leaning right. */
  lean: z.number().min(-1).max(1),
  /** Articulated arm: -1 down, 1 raised. */
  arm: z.number().min(-1).max(1),
  /** True while the puppeteer is speaking; drives the talking animation. */
  talking: z.boolean(),
});
export type Pose = z.infer<typeof PoseSchema>;
export const NEUTRAL_POSE: Pose = { x: 0, y: 0, lean: 0, arm: 0, talking: false };

export const SeatIdSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);
export type SeatId = z.infer<typeof SeatIdSchema>;

/** Room codes are 4 letters from an alphabet without look-alikes (no I, O, Q…). */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export const RoomCodeSchema = z.string().regex(/^[A-Z]{4}$/);
export type RoomCode = z.infer<typeof RoomCodeSchema>;

export const RoleSchema = z.enum(['stage', 'controller']);
export type Role = z.infer<typeof RoleSchema>;

export const MAX_CONTROLLERS = 4;

// ---------------------------------------------------------------------------
// Stage state (TV → phones). The stage is the single source of truth.
// ---------------------------------------------------------------------------

export const SeatInfoSchema = z.object({
  /** Player slot: p1…p4. Which puppet sits in it can change per culture or by choice. */
  id: SeatIdSchema,
  /** Puppeteer's name if they gave one, else the puppet's name. */
  name: z.string(),
  puppetId: z.string(),
  puppetName: z.string(),
  color: z.string(),
  connected: z.boolean(),
  /** The first phone to join becomes host and gets the play menu. */
  isHost: z.boolean(),
  /** Character this seat voices in the running play, if any. */
  character: z.string().optional(),
});

export const PLAYER_SEATS = ['p1', 'p2', 'p3', 'p4'] as const;
export type PlayerSeat = (typeof PLAYER_SEATS)[number];
export type SeatInfo = z.infer<typeof SeatInfoSchema>;

export const LineTokenSchema = z.object({ word: z.string(), matched: z.boolean() });
export const LineProgressSchema = z.object({
  tokens: z.array(LineTokenSchema),
  ratio: z.number().min(0).max(1),
  passed: z.boolean(),
});
export type LineProgress = z.infer<typeof LineProgressSchema>;

export const CurrentLineSchema = z.object({
  /** Player seat voicing this line, or undefined when anyone may (an unclaimed character). */
  seat: SeatIdSchema.optional(),
  /** The play's character id (e.g. "karagoz"). */
  character: z.string(),
  speaker: z.string(),
  text: z.string(),
  hint: z.string().optional(),
  song: z.boolean().optional(),
});

export const PlayStateSchema = z.object({
  id: z.string(),
  title: z.string(),
  sectionTitle: z.string(),
  lineIndex: z.number().int().min(0),
  totalLines: z.number().int().min(0),
  line: CurrentLineSchema.nullable(),
  progress: LineProgressSchema.nullable(),
  finished: z.boolean(),
  /** Number of lines passed by speech recognition (not skipped by hand). */
  spokenLines: z.number().int().min(0),
});
export type PlayState = z.infer<typeof PlayStateSchema>;

export const StageModeSchema = z.enum(['lobby', 'free', 'play']);
export type StageMode = z.infer<typeof StageModeSchema>;

export const PlanSchema = z.enum(['free', 'plus']);
export type Plan = z.infer<typeof PlanSchema>;

export const StageStateSchema = z.object({
  mode: StageModeSchema,
  cultureId: z.string(),
  karaoke: z.boolean(),
  leniency: z.enum(['kids', 'normal', 'strict']),
  plan: PlanSchema,
  seats: z.array(SeatInfoSchema),
  play: PlayStateSchema.nullable(),
  /** Short status the phones show, e.g. after a rejected licence key. */
  notice: z.string().optional(),
});
export type StageState = z.infer<typeof StageStateSchema>;

// ---------------------------------------------------------------------------
// Client → relay
// ---------------------------------------------------------------------------

export const HelloMsgSchema = z.object({
  t: z.literal('hello'),
  role: RoleSchema,
  seat: SeatIdSchema.optional(),
  name: z.string().trim().min(1).max(40).optional(),
});

export const PoseMsgSchema = z.object({
  t: z.literal('pose'),
  pose: PoseSchema,
});

export const GestureMsgSchema = z.object({
  t: z.literal('gesture'),
  gesture: GestureSchema,
});

export const SpeechMsgSchema = z.object({
  t: z.literal('speech'),
  /** Everything heard since the current line started. */
  transcript: z.string().max(2000),
  final: z.boolean(),
  /** The line the phone believes is current; stale transcripts are dropped. */
  lineIndex: z.number().int().min(0).optional(),
});

export const CONTROL_ACTIONS = [
  'next',
  'prev',
  'start-play',
  'free-play',
  'lobby',
  'toggle-karaoke',
  'set-culture',
  'set-puppet',
  'set-leniency',
  'said-it',
  'activate-license',
] as const;

export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export const ControlMsgSchema = z.object({
  t: z.literal('control'),
  action: z.enum(CONTROL_ACTIONS),
  playId: z.string().optional(),
  cultureId: z.string().optional(),
  puppetId: z.string().optional(),
  leniency: z.enum(['kids', 'normal', 'strict']).optional(),
  licenseKey: z.string().max(80).optional(),
});

export const StateMsgSchema = z.object({
  t: z.literal('state'),
  state: StageStateSchema,
});

export const PingMsgSchema = z.object({ t: z.literal('ping') });

export const ControllerMsgSchema = z.discriminatedUnion('t', [
  PoseMsgSchema,
  GestureMsgSchema,
  SpeechMsgSchema,
  ControlMsgSchema,
]);
export type ControllerMsg = z.infer<typeof ControllerMsgSchema>;

export const ClientMsgSchema = z.discriminatedUnion('t', [
  HelloMsgSchema,
  PoseMsgSchema,
  GestureMsgSchema,
  SpeechMsgSchema,
  ControlMsgSchema,
  StateMsgSchema,
  PingMsgSchema,
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

// ---------------------------------------------------------------------------
// Relay → clients
// ---------------------------------------------------------------------------

export const PeerInfoSchema = z.object({
  seat: SeatIdSchema,
  name: z.string().optional(),
});
export type PeerInfo = z.infer<typeof PeerInfoSchema>;

export const WelcomeMsgSchema = z.object({
  t: z.literal('welcome'),
  role: RoleSchema,
  code: RoomCodeSchema,
  seat: SeatIdSchema.optional(),
  stageConnected: z.boolean(),
  peers: z.array(PeerInfoSchema),
});

export const JoinedMsgSchema = z.object({
  t: z.literal('joined'),
  seat: SeatIdSchema,
  name: z.string().optional(),
});

export const LeftMsgSchema = z.object({
  t: z.literal('left'),
  seat: SeatIdSchema,
});

export const StageOnlineMsgSchema = z.object({
  t: z.literal('stage'),
  online: z.boolean(),
});

export const ERROR_CODES = [
  'bad-message',
  'not-introduced',
  'room-full',
  'seat-required',
  'unknown-room',
] as const;

export const ErrorMsgSchema = z.object({
  t: z.literal('error'),
  code: z.enum(ERROR_CODES),
  message: z.string(),
});

export type ErrorCode = (typeof ERROR_CODES)[number];

export const PongMsgSchema = z.object({ t: z.literal('pong') });

/** Controller messages arrive on the stage stamped with the sender's seat. */
export const FromControllerMsgSchema = z.discriminatedUnion('t', [
  PoseMsgSchema.extend({ seat: SeatIdSchema }),
  GestureMsgSchema.extend({ seat: SeatIdSchema }),
  SpeechMsgSchema.extend({ seat: SeatIdSchema }),
  ControlMsgSchema.extend({ seat: SeatIdSchema }),
]);
export type FromControllerMsg = z.infer<typeof FromControllerMsgSchema>;

export const ServerMsgSchema = z.discriminatedUnion('t', [
  WelcomeMsgSchema,
  JoinedMsgSchema,
  LeftMsgSchema,
  StageOnlineMsgSchema,
  ErrorMsgSchema,
  PongMsgSchema,
  StateMsgSchema,
  ...FromControllerMsgSchema.options,
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;

/** Every message the stage may receive over its socket. */
export const StageInboundSchema = z.discriminatedUnion('t', [
  WelcomeMsgSchema,
  JoinedMsgSchema,
  LeftMsgSchema,
  ErrorMsgSchema,
  PongMsgSchema,
  ...FromControllerMsgSchema.options,
]);
export type StageInbound = z.infer<typeof StageInboundSchema>;

/** Every message a controller may receive over its socket. */
export const ControllerInboundSchema = z.discriminatedUnion('t', [
  WelcomeMsgSchema,
  JoinedMsgSchema,
  LeftMsgSchema,
  StageOnlineMsgSchema,
  ErrorMsgSchema,
  PongMsgSchema,
  StateMsgSchema,
]);
export type ControllerInbound = z.infer<typeof ControllerInboundSchema>;

export function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Generate a room code from a source of randomness (0..1). */
export function makeRoomCode(random: () => number = Math.random): RoomCode {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  }
  return code;
}

/** Build the URL a phone scans to join a seat. */
export function joinUrl(origin: string, code: RoomCode, seat: SeatId): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/join?room=${encodeURIComponent(code)}&seat=${encodeURIComponent(seat)}`;
}
