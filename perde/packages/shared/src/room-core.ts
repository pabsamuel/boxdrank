import {
  ClientMsgSchema,
  MAX_CONTROLLERS,
  parseJson,
  type ClientMsg,
  type ErrorCode,
  type PeerInfo,
  type Role,
  type RoomCode,
  type SeatId,
  type ServerMsg,
} from './protocol';

/**
 * Pure room routing logic shared by the Cloudflare Durable Object and tests.
 *
 * A room has at most one stage (the TV) and up to MAX_CONTROLLERS phones.
 * The relay stamps controller messages with the seat and forwards them to
 * the stage; stage `state` messages fan out to every phone.
 *
 * Peers are thin adapters over sockets. Identity (role/seat/name) is stored
 * on the adapter so a hibernated Durable Object can rebuild it from socket
 * attachments without keeping anything in memory.
 */

export interface PeerIdentity {
  role?: Role;
  seat?: SeatId;
  name?: string;
}

export interface Peer extends PeerIdentity {
  id: string;
  send(msg: ServerMsg): void;
  close(code: number, reason: string): void;
  /** Persist identity (Durable Objects write it to the socket attachment). */
  setIdentity(identity: PeerIdentity): void;
}

export interface RoomContext {
  code: RoomCode;
  peers: Peer[];
}

export function stageOf(ctx: RoomContext): Peer | undefined {
  return ctx.peers.find((p) => p.role === 'stage');
}

export function controllersOf(ctx: RoomContext): Peer[] {
  return ctx.peers.filter((p) => p.role === 'controller');
}

function peerInfos(ctx: RoomContext): PeerInfo[] {
  return controllersOf(ctx)
    .filter((p): p is Peer & { seat: SeatId } => typeof p.seat === 'string')
    .map((p) => ({ seat: p.seat, name: p.name }));
}

function sendError(peer: Peer, code: ErrorCode, message: string) {
  peer.send({ t: 'error', code, message });
}

/** Handle one inbound frame from `self`. Returns true when the frame was valid. */
export function handleMessage(ctx: RoomContext, self: Peer, raw: unknown): boolean {
  const json = parseJson(raw);
  const parsed = ClientMsgSchema.safeParse(json);
  if (!parsed.success) {
    sendError(self, 'bad-message', 'Could not parse message');
    return false;
  }
  const msg: ClientMsg = parsed.data;

  if (msg.t === 'ping') {
    self.send({ t: 'pong' });
    return true;
  }

  if (msg.t === 'hello') {
    return handleHello(ctx, self, msg);
  }

  if (!self.role) {
    sendError(self, 'not-introduced', 'Send hello first');
    return false;
  }

  if (self.role === 'controller') {
    if (msg.t === 'state') {
      sendError(self, 'bad-message', 'Only the stage sends state');
      return false;
    }
    const stage = stageOf(ctx);
    if (stage && self.seat) {
      stage.send({ ...msg, seat: self.seat });
    }
    return true;
  }

  // self.role === 'stage'
  if (msg.t === 'state') {
    for (const c of controllersOf(ctx)) c.send(msg);
    return true;
  }
  sendError(self, 'bad-message', 'The stage only sends state');
  return false;
}

function handleHello(
  ctx: RoomContext,
  self: Peer,
  hello: Extract<ClientMsg, { t: 'hello' }>,
): boolean {
  if (hello.role === 'stage') {
    // A reloaded TV replaces the previous stage socket.
    for (const old of ctx.peers) {
      if (old.role === 'stage' && old.id !== self.id) old.close(4000, 'replaced by a new stage');
    }
    self.setIdentity({ role: 'stage' });
    self.send({
      t: 'welcome',
      role: 'stage',
      code: ctx.code,
      stageConnected: true,
      peers: peerInfos(ctx),
    });
    for (const c of controllersOf(ctx)) c.send({ t: 'stage', online: true });
    return true;
  }

  if (!hello.seat) {
    sendError(self, 'seat-required', 'Controllers must pick a seat');
    return false;
  }
  const others = controllersOf(ctx).filter((p) => p.id !== self.id);
  // A reloaded phone replaces the previous socket on the same seat.
  for (const old of others) {
    if (old.seat === hello.seat) old.close(4001, 'replaced by a new controller on this seat');
  }
  const remaining = others.filter((p) => p.seat !== hello.seat);
  if (remaining.length >= MAX_CONTROLLERS) {
    sendError(self, 'room-full', `At most ${MAX_CONTROLLERS} puppeteers per room`);
    return false;
  }
  self.setIdentity({ role: 'controller', seat: hello.seat, name: hello.name });
  const stage = stageOf(ctx);
  self.send({
    t: 'welcome',
    role: 'controller',
    code: ctx.code,
    seat: hello.seat,
    stageConnected: Boolean(stage),
    peers: remaining
      .filter((p): p is Peer & { seat: SeatId } => typeof p.seat === 'string')
      .map((p) => ({ seat: p.seat, name: p.name })),
  });
  stage?.send({ t: 'joined', seat: hello.seat, name: hello.name });
  return true;
}

/** A peer's socket closed; tell the others. */
export function handleClose(ctx: RoomContext, self: Peer): void {
  const others = ctx.peers.filter((p) => p.id !== self.id);
  if (self.role === 'controller' && self.seat) {
    const stage = others.find((p) => p.role === 'stage');
    // Only announce if no replacement already took the seat.
    if (stage && !others.some((p) => p.role === 'controller' && p.seat === self.seat)) {
      stage.send({ t: 'left', seat: self.seat });
    }
  } else if (self.role === 'stage') {
    if (!others.some((p) => p.role === 'stage')) {
      for (const c of others) if (c.role === 'controller') c.send({ t: 'stage', online: false });
    }
  }
}
