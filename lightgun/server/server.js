// Pairing + relay. Deliberately dumb: it knows about rooms and nothing else.
// No database, no accounts, no game logic. Aim packets are forwarded untouched
// so the server adds no meaningful latency and nothing to debug.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { ensureCert, lanAddress } from './certs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Reassigned if the preferred port is already taken; the QR code and
// /api/info both read these, so the phone always gets the real one.
let HTTP_PORT = Number(process.env.LG_HTTP_PORT || 8080);
let HTTPS_PORT = Number(process.env.LG_HTTPS_PORT || 8443);

/* ------------------------------------------------------------ static files */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}

async function handle(req, res, secure) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let p = decodeURIComponent(url.pathname);

  // Redirect rather than rewrite, so the page's relative asset paths resolve.
  if (p === '/' || p === '/display') {
    res.writeHead(302, { location: `/display/${url.search}` });
    res.end();
    return;
  }
  if (p === '/phone') {
    res.writeHead(302, { location: `/phone/${url.search}` });
    res.end();
    return;
  }
  if (p === '/display/') p = '/display/index.html';
  else if (p === '/phone/') p = '/phone/index.html';

  if (p === '/api/info') {
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      lanIp: lanAddress(),
      httpPort: HTTP_PORT,
      httpsPort: HTTPS_PORT,
      https: HAS_TLS,
      secure,
    }));
    return;
  }

  if (p === '/api/qr') {
    const target = url.searchParams.get('url') || '';
    try {
      const png = await QRCode.toBuffer(target, {
        width: 640, margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#000000ff', light: '#ffffffff' },
      });
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(png);
    } catch {
      res.writeHead(400).end('bad qr payload');
    }
    return;
  }

  const filePath = path.normalize(path.join(root, p));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  serveFile(res, filePath);
}

/* ------------------------------------------------------------ room relay */

/** room code -> Set of sockets */
const rooms = new Map();
let nextId = 1;

function peersOf(room, except) {
  return [...(rooms.get(room) || [])].filter((s) => s !== except && s.readyState === 1);
}

function send(sock, obj) {
  if (sock.readyState === 1) sock.send(JSON.stringify(obj));
}

function announce(room) {
  const members = [...(rooms.get(room) || [])].map((s) => ({
    id: s.lgId, role: s.lgRole, name: s.lgName,
  }));
  for (const s of rooms.get(room) || []) send(s, { t: 'peers', peers: members });
}

function attachWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  // Without this, any server error is re-emitted here with no listener and
  // takes the process down as an unhandled 'error' event.
  wss.on('error', (err) => console.error(`  websocket error: ${err.message}`));
  wss.on('connection', (sock) => {
    sock.lgId = nextId++;
    sock.isAlive = true;
    sock.on('pong', () => { sock.isAlive = true; });

    sock.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf); } catch { return; }

      if (msg.t === 'hello') {
        sock.lgRole = msg.role === 'display' ? 'display' : 'phone';
        sock.lgRoom = String(msg.room || '').toUpperCase().slice(0, 8);
        sock.lgName = String(msg.name || '').slice(0, 24);
        if (!sock.lgRoom) { sock.close(); return; }
        if (!rooms.has(sock.lgRoom)) rooms.set(sock.lgRoom, new Set());
        rooms.get(sock.lgRoom).add(sock);
        // Slot index lets the display keep P1/P2 stable across reconnects.
        const phones = [...rooms.get(sock.lgRoom)].filter((s) => s.lgRole === 'phone');
        sock.lgSlot = sock.lgRole === 'phone' ? phones.indexOf(sock) : -1;
        send(sock, { t: 'welcome', id: sock.lgId, room: sock.lgRoom, role: sock.lgRole, slot: sock.lgSlot });
        announce(sock.lgRoom);
        return;
      }

      if (!sock.lgRoom) return;
      msg.from = sock.lgId;
      msg.fromRole = sock.lgRole;
      msg.slot = sock.lgSlot;
      const payload = JSON.stringify(msg);
      for (const peer of peersOf(sock.lgRoom, sock)) peer.send(payload);
    });

    sock.on('close', () => {
      const set = rooms.get(sock.lgRoom);
      if (!set) return;
      set.delete(sock);
      if (set.size === 0) rooms.delete(sock.lgRoom);
      else {
        for (const s of set) send(s, { t: 'peerGone', id: sock.lgId, role: sock.lgRole });
        announce(sock.lgRoom);
      }
    });
  });

  setInterval(() => {
    for (const sock of wss.clients) {
      if (!sock.isAlive) { sock.terminate(); continue; }
      sock.isAlive = false;
      sock.ping();
    }
  }, 15000).unref();

  return wss;
}

/* ---------------------------------------------------------------- startup */

const tls = await ensureCert();
const HAS_TLS = Boolean(tls);

/**
 * Listen, stepping to the next port if something else already has this one.
 *
 * Port 8080 is the most contested number in local development — a stray dev
 * server on it used to make this exit with an EADDRINUSE stack trace, which
 * reads as "the light gun is broken" rather than "pick another port".
 */
function listenWithFallback(server, preferred, label, tries = 12) {
  return new Promise((resolve, reject) => {
    let port = preferred;
    let attempts = 0;
    const attempt = () => {
      server.once('error', (err) => {
        if (err.code !== 'EADDRINUSE' || ++attempts >= tries) {
          reject(err);
          return;
        }
        if (attempts === 1) {
          console.log(`  note: port ${preferred} is already in use by something else — finding a free one`);
        }
        port += 1;
        attempt();
      });
      server.listen(port, () => resolve(port));
    };
    attempt();
  });
}

const httpServer = http.createServer((req, res) => handle(req, res, false));
const httpsServer = tls ? https.createServer(tls, (req, res) => handle(req, res, true)) : null;

// Bind first, attach WebSockets second: a WebSocketServer bound to a socket
// that then fails to listen turns a recoverable port clash into a crash.
try {
  HTTP_PORT = await listenWithFallback(httpServer, HTTP_PORT, 'http');
  if (httpsServer) HTTPS_PORT = await listenWithFallback(httpsServer, HTTPS_PORT, 'https');
} catch (err) {
  console.error(`\n  could not start: ${err.message}`);
  console.error('  set LG_HTTP_PORT / LG_HTTPS_PORT to choose ports explicitly.\n');
  process.exit(1);
}

attachWs(httpServer);
if (httpsServer) attachWs(httpsServer);

console.log(`\n  display   http://localhost:${HTTP_PORT}/`);
if (httpsServer) {
  console.log(`  phone     https://${lanAddress()}:${HTTPS_PORT}/phone   (self-signed: tap "Advanced -> Proceed" once)`);
  console.log('\n  WebXR needs HTTPS, so the QR code always points at the https URL.');
} else {
  console.log('  !! openssl not available: HTTPS disabled, WebXR aiming will not work from a phone.');
}
if (HTTP_PORT !== Number(process.env.LG_HTTP_PORT || 8080)) {
  console.log(`\n  (open the display on ${HTTP_PORT}, not 8080 — 8080 was taken)`);
}
