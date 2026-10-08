import { DurableObject } from 'cloudflare:workers';
import {
  handleClose,
  handleMessage,
  makeRoomCode,
  RoomCodeSchema,
  type Peer,
  type PeerIdentity,
  type RoomCode,
  type RoomContext,
  type ServerMsg,
} from '@perde/shared';
import {
  activateLicense,
  entitlementsMode,
  validateLicense,
  type EntitlementsEnv,
} from './entitlements';

/**
 * Perde relay: one Durable Object per room, WebSocket hibernation so idle
 * rooms cost nothing, and the Vite build served as static assets.
 *
 *   POST /api/rooms                 → { code }
 *   GET  /api/rooms/:code           → { code, stage, controllers }
 *   GET  /api/rooms/:code/ws        → WebSocket (send { t: "hello" } first)
 *   GET  /api/entitlements          → { mode, plan }
 *   POST /api/license/activate      → { ok, plan, instanceId }
 *   POST /api/license/validate      → { ok, plan }
 *   GET  /api/health                → { ok, version }
 */

export interface Env extends EntitlementsEnv {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

const VERSION = '0.1.0';
/** A room is deleted this long after its last socket closes. */
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error('api error', err);
        return json({ error: 'internal' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  if (path === '/api/health')
    return json({ ok: true, version: VERSION, mode: entitlementsMode(env) });

  if (path === '/api/rooms' && method === 'POST') {
    // Retry on the (rare) collision with a live room.
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = makeRoomCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const res = await stub.fetch('https://room/create', { method: 'POST', body: code });
      if (res.status === 201) return json({ code }, 201);
    }
    return json({ error: 'no-free-code' }, 503);
  }

  const roomMatch = /^\/api\/rooms\/([A-Za-z]{4})(\/ws)?$/.exec(path);
  if (roomMatch) {
    const code = roomMatch[1]!.toUpperCase();
    if (!RoomCodeSchema.safeParse(code).success) return json({ error: 'bad-code' }, 400);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (roomMatch[2]) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'expected-websocket' }, 426);
      }
      return stub.fetch('https://room/ws', request);
    }
    return stub.fetch('https://room/info');
  }

  if (path === '/api/entitlements' && method === 'GET') {
    const mode = entitlementsMode(env);
    return json({ mode, plan: mode === 'open' ? 'plus' : 'free' });
  }

  if ((path === '/api/license/activate' || path === '/api/license/validate') && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      key?: unknown;
      instanceName?: unknown;
      instanceId?: unknown;
    };
    const key = typeof body.key === 'string' ? body.key : '';
    if (path.endsWith('activate')) {
      const name = typeof body.instanceName === 'string' ? body.instanceName : 'Perde TV';
      return json(await activateLicense(env, key, name));
    }
    const instanceId = typeof body.instanceId === 'string' ? body.instanceId : undefined;
    return json(await validateLicense(env, key, instanceId));
  }

  return json({ error: 'not-found' }, 404);
}

// ---------------------------------------------------------------------------
// Room Durable Object
// ---------------------------------------------------------------------------

interface Attachment extends PeerIdentity {
  id: string;
}

interface DoPeer extends Peer {
  ws: WebSocket;
}

function wrap(ws: WebSocket): DoPeer {
  const att = (ws.deserializeAttachment() ?? { id: 'unknown' }) as Attachment;
  const peer: DoPeer = {
    ws,
    id: att.id,
    role: att.role,
    seat: att.seat,
    name: att.name,
    send(msg: ServerMsg) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* socket already gone; the close handler cleans up */
      }
    },
    close(code: number, reason: string) {
      try {
        ws.close(code, reason);
      } catch {
        /* ignore */
      }
    },
    setIdentity(identity: PeerIdentity) {
      peer.role = identity.role;
      peer.seat = identity.seat;
      peer.name = identity.name;
      ws.serializeAttachment({ id: att.id, ...identity } satisfies Attachment);
    },
  };
  return peer;
}

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alives are answered by the runtime without waking the object.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'),
    );
  }

  private async code(): Promise<RoomCode | undefined> {
    return this.ctx.storage.get<RoomCode>('code');
  }

  private async context(): Promise<RoomContext | undefined> {
    const code = await this.code();
    if (!code) return undefined;
    return { code, peers: this.ctx.getWebSockets().map(wrap) };
  }

  private async touch(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/create') {
      const existing = await this.code();
      if (existing && this.ctx.getWebSockets().length > 0) return json({ error: 'in-use' }, 409);
      const code = (await request.text()).toUpperCase();
      if (!RoomCodeSchema.safeParse(code).success) return json({ error: 'bad-code' }, 400);
      await this.ctx.storage.put({ code, createdAt: Date.now() });
      await this.touch();
      return json({ code }, 201);
    }

    const ctx = await this.context();
    if (!ctx) return json({ error: 'unknown-room' }, 404);

    if (url.pathname === '/info') {
      return json({
        code: ctx.code,
        stage: ctx.peers.some((p) => p.role === 'stage'),
        controllers: ctx.peers
          .filter((p) => p.role === 'controller')
          .map((p) => ({ seat: p.seat, name: p.name })),
      });
    }

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ id: crypto.randomUUID() } satisfies Attachment);
      await this.touch();
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: 'not-found' }, 404);
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const ctx = await this.context();
    if (!ctx) return ws.close(4004, 'unknown room');
    const self = ctx.peers.find((p) => (p as DoPeer).ws === ws) ?? wrap(ws);
    handleMessage(
      ctx,
      self,
      typeof message === 'string' ? message : new TextDecoder().decode(message),
    );
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.departed(ws);
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.departed(ws);
  }

  private async departed(ws: WebSocket): Promise<void> {
    const ctx = await this.context();
    if (!ctx) return;
    const self = wrap(ws);
    const others = { ...ctx, peers: ctx.peers.filter((p) => (p as DoPeer).ws !== ws) };
    handleClose(others, self);
    await this.touch();
  }

  override async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.touch();
      return;
    }
    await this.ctx.storage.deleteAll();
  }
}
