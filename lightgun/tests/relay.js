// Does the relay survive being on the internet, without getting in the way of
// a real game?
//
// Hosted mode puts this server on a public URL, where it will meet traffic that
// is not a light gun. Both halves are tested here: that abuse is cut off, and
// that a normal 60 Hz aim stream — which looks a lot like a flood — is not.
//
//   node tests/relay.js          (expects the server running on LG_BASE)

import { WebSocket } from 'ws';

const BASE = (process.env.LG_BASE || 'http://127.0.0.1:8080').replace('http', 'ws') + '/ws';

let failures = 0;
const out = [];
function check(name, ok, detail = '') {
  if (!ok) failures++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open a socket and resolve once it is connected. */
function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE);
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    ws.on('open', () => { clearTimeout(t); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

/** Wait for the socket to close, returning its code (or null if it stays up). */
function closedWithin(ws, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    ws.on('close', (code) => { clearTimeout(t); resolve(code); });
  });
}

const join = (ws, room, role = 'phone') =>
  ws.send(JSON.stringify({ t: 'hello', role, room, name: 'test' }));

/* ------------------------------------------- 1. a real aim stream is fine */

{
  const display = await open();
  const phone = await open();
  join(display, 'RELAY1', 'display');
  join(phone, 'RELAY1', 'phone');
  await sleep(200);

  let received = 0;
  display.on('message', (b) => { if (JSON.parse(b).t === 'aim') received++; });

  // Three seconds of a 60 Hz gun is 180 packets — the shape of real play.
  for (let i = 0; i < 180; i++) {
    phone.send(JSON.stringify({ t: 'aim', x: 0.5, y: 0.5, ts: i, seq: i }));
    if (i % 6 === 0) await sleep(1);
  }
  await sleep(400);

  const closed = phone.readyState === WebSocket.CLOSED;
  out.push(`      sent 180 aim packets, display received ${received}`);
  check('a 60 Hz aim stream is not cut off', !closed && received > 170,
    `${received} received, socket ${closed ? 'closed' : 'open'}`);
  display.close();
  phone.close();
}

/* ------------------------------------------------- 2. a flood is cut off */

{
  const ws = await open();
  join(ws, 'RELAY2');
  await sleep(150);
  // Far past any plausible controller: as fast as the socket will take it.
  for (let i = 0; i < 4000; i++) ws.send(JSON.stringify({ t: 'aim', x: 0, y: 0, seq: i }));
  const code = await closedWithin(ws, 4000);
  check('a message flood is disconnected', code === 4001, `close code ${code}`);
}

/* --------------------------------------------- 3. an oversized frame is refused */

{
  const ws = await open();
  join(ws, 'RELAY3');
  await sleep(150);
  // 1 MB, well past the 256 KB cap and past anything the trace upload sends.
  ws.send(JSON.stringify({ t: 'aim', pad: 'x'.repeat(1024 * 1024) }));
  const code = await closedWithin(ws, 4000);
  check('an oversized frame closes the socket', code !== null, `close code ${code}`);
}

/* ---------------------------------------------------- 4. room capacity */

{
  const sockets = [];
  for (let i = 0; i < 10; i++) {
    const ws = await open();
    join(ws, 'RELAY4');
    sockets.push(ws);
    await sleep(60);
  }
  await sleep(600);
  const alive = sockets.filter((w) => w.readyState === WebSocket.OPEN).length;
  out.push(`      opened 10 sockets into one room, ${alive} still connected`);
  check('a room stops accepting beyond its capacity', alive <= 8, `${alive} alive`);
  for (const w of sockets) w.close();
}

/* ------------------------------------------- 5. junk does not take it down */

{
  const ws = await open();
  ws.send('not json at all');
  ws.send(JSON.stringify(['an', 'array']));
  ws.send(JSON.stringify({ no: 'type field' }));
  ws.send(JSON.stringify({ t: 12345 }));
  ws.send(JSON.stringify(null));
  await sleep(300);
  // The server must still be answering: open a fresh socket and use it.
  const fresh = await open();
  join(fresh, 'RELAY5', 'display');
  const welcomed = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 3000);
    fresh.on('message', (b) => {
      if (JSON.parse(b).t === 'welcome') { clearTimeout(t); resolve(true); }
    });
  });
  check('malformed messages do not take the relay down', welcomed);
  ws.close();
  fresh.close();
}

/* ------------------------------------ 6. a socket that never joins is dropped */

{
  const ws = await open();
  // Says nothing at all. The server should not hold it open forever.
  const code = await closedWithin(ws, 12000);
  check('a socket that never joins a room is dropped', code === 4000, `close code ${code}`);
}

/* ----------------------------------------- 7. rooms stay isolated */

{
  const a = await open();
  const b = await open();
  join(a, 'ROOMA', 'display');
  join(b, 'ROOMB', 'phone');
  await sleep(200);

  let leaked = 0;
  a.on('message', (buf) => { if (JSON.parse(buf).t === 'aim') leaked++; });
  for (let i = 0; i < 10; i++) b.send(JSON.stringify({ t: 'aim', x: 1, y: 1 }));
  await sleep(400);
  check('a room never sees another room\'s traffic', leaked === 0, `${leaked} leaked`);
  a.close();
  b.close();
}

console.log(out.join('\n'));
console.log(`\n${failures === 0 ? 'ALL RELAY TESTS PASSED' : failures + ' RELAY TEST(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
