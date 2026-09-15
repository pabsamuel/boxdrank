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
const HTTP_PORT = Number(process.env.LG_HTTP_PORT || 8080);
const HTTPS_PORT = Number(process.env.LG_HTTPS_PORT || 8443);

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

const tls = ensureCert();
const HAS_TLS = Boolean(tls);

const httpServer = http.createServer((req, res) => handle(req, res, false));
attachWs(httpServer);
httpServer.listen(HTTP_PORT, () => {
  console.log(`  display   http://localhost:${HTTP_PORT}/`);
});

if (tls) {
  const httpsServer = https.createServer(tls, (req, res) => handle(req, res, true));
  attachWs(httpsServer);
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`  phone     https://${lanAddress()}:${HTTPS_PORT}/phone   (self-signed: tap "Advanced -> Proceed" once)`);
    console.log(`\n  WebXR needs HTTPS, so the QR code always points at the https URL.`);
  });
} else {
  console.log('  !! openssl not available: HTTPS disabled, WebXR aiming will not work from a phone.');
}
