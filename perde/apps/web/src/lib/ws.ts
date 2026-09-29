import {
  ControllerInboundSchema,
  StageInboundSchema,
  type ClientMsg,
  type ControllerInbound,
  type StageInbound,
} from '@perde/shared';

/**
 * A reconnecting WebSocket for one room. It re-sends `hello` after every
 * reconnect, pings to keep NATs and hibernating objects honest, and parses
 * everything through the shared schemas so the UI never sees junk.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface RoomSocketOptions<In> {
  code: string;
  hello: Extract<ClientMsg, { t: 'hello' }>;
  schema: { safeParse(v: unknown): { success: true; data: In } | { success: false } };
  onMessage(msg: In): void;
  onStatus?(status: ConnectionStatus): void;
}

export function wsUrl(code: string, origin = window.location.origin): string {
  const u = new URL(`/api/rooms/${encodeURIComponent(code)}/ws`, origin);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

export class RoomSocket<In> {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  status: ConnectionStatus = 'connecting';

  constructor(private readonly opts: RoomSocketOptions<In>) {
    this.connect();
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.opts.onStatus?.(s);
  }

  private connect() {
    if (this.closedByUser) return;
    this.setStatus('connecting');
    const ws = new WebSocket(wsUrl(this.opts.code));
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('open');
      ws.send(JSON.stringify(this.opts.hello));
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (ev) => {
      let json: unknown;
      try {
        json = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const parsed = this.opts.schema.safeParse(json);
      if (parsed.success) this.opts.onMessage(parsed.data);
    };
    ws.onclose = (ev) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.setStatus('closed');
      // 4000/4001: replaced by a newer socket on purpose; do not fight it.
      if (this.closedByUser || ev.code === 4000 || ev.code === 4001) return;
      const delay = Math.min(8000, 500 * 2 ** this.attempt++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  send(msg: ClientMsg): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close(1000, 'bye');
  }
}

export function openStageSocket(
  code: string,
  onMessage: (m: StageInbound) => void,
  onStatus?: (s: ConnectionStatus) => void,
) {
  return new RoomSocket<StageInbound>({
    code,
    hello: { t: 'hello', role: 'stage' },
    schema: StageInboundSchema,
    onMessage,
    onStatus,
  });
}

export function openControllerSocket(
  code: string,
  seat: string,
  name: string | undefined,
  onMessage: (m: ControllerInbound) => void,
  onStatus?: (s: ConnectionStatus) => void,
) {
  return new RoomSocket<ControllerInbound>({
    code,
    hello: { t: 'hello', role: 'controller', seat, name: name?.trim() || undefined },
    schema: ControllerInboundSchema,
    onMessage,
    onStatus,
  });
}
