// Thin WebSocket wrapper shared by the display and the phone.
//
// Transport choice: a LAN WebSocket, not WebRTC. Measured round trip on a
// normal home Wi-Fi is a few milliseconds, which is already well under one
// display frame, so a data channel would buy nothing and cost a signalling
// dance. See docs/ARCHITECTURE.md.

export class Net extends EventTarget {
  constructor({ role, room, name = '' }) {
    super();
    this.role = role;
    this.room = room;
    this.name = name;
    this.ws = null;
    this.id = null;
    this.connected = false;
    this.clockOffset = 0;     // peerClock - ourClock, milliseconds
    this.rttMs = 0;
    this.sent = 0;
    this.received = 0;
    this._retry = 0;
    this.peers = new Map();   // peer id -> { rtt, bestRtt, offset, samples }
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect() {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this._retry = 0;
      this.send({ t: 'hello', role: this.role, room: this.room, name: this.name });
      this.emit('open');
    };
    ws.onclose = () => {
      this.connected = false;
      this.emit('close');
      const delay = Math.min(4000, 250 * 2 ** this._retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.received++;
      if (msg.t === 'welcome') { this.id = msg.id; this.slot = msg.slot; }
      // The relay is a broadcast, so addressed messages are filtered here.
      if (msg.to != null && this.id != null && msg.to !== this.id) return;
      if (msg.t === 'ping') { this.send({ t: 'pong', a: msg.a, b: performance.now() }); return; }
      if (msg.t === 'pong') { this._onPong(msg); return; }
      this.emit(msg.t, msg);
      this.emit('*', msg);
    };
    return this;
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      this.sent++;
      return true;
    }
    return false;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }

  /** NTP-style exchange: learn the peer's clock offset and the round trip. */
  ping() {
    this.send({ t: 'ping', a: performance.now() });
  }

  _onPong(msg) {
    const now = performance.now();
    const rtt = now - msg.a;
    const offset = msg.b - (msg.a + rtt / 2);
    const key = msg.from ?? 'peer';
    let rec = this.peers.get(key);
    if (!rec) { rec = { samples: [] }; this.peers.set(key, rec); }
    rec.samples.push({ rtt, offset });
    if (rec.samples.length > 16) rec.samples.shift();
    // Use the lowest-RTT sample: it is the least polluted by scheduling noise.
    const best = rec.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    rec.rtt = rtt;
    rec.bestRtt = best.rtt;
    rec.offset = best.offset;
    this.rttMs = rtt;
    this.bestRttMs = best.rtt;
    this.clockOffset = best.offset;
    this.emit('latency', { from: key, rtt, bestRtt: best.rtt });
  }

  /** Convert a peer timestamp into our own clock. */
  peerToLocal(peerMs, from) {
    const rec = from !== undefined ? this.peers.get(from) : null;
    return peerMs - (rec ? rec.offset : this.clockOffset);
  }

  rttFor(from) {
    const rec = this.peers.get(from);
    return rec ? rec.bestRtt : this.bestRttMs;
  }

  startPinging(intervalMs = 1000) {
    this.ping();
    setInterval(() => this.ping(), intervalMs);
    return this;
  }
}

/** Four characters, no vowels and no look-alikes, so room codes are readable. */
export function makeRoomCode() {
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
