// WebXR needs a secure context, and a phone on the LAN is not "localhost", so
// the controller has to be served over HTTPS. We mint a long-lived self-signed
// certificate once, covering every local IP we can see, and cache it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '.certs');

export function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

/** Best guess at the address a phone on the same Wi-Fi should dial. */
export function lanAddress() {
  const addrs = localAddresses();
  const priv = addrs.filter((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  return priv[0] || addrs[0] || '127.0.0.1';
}

export function ensureCert() {
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const wanted = ['localhost', ...localAddresses()].join(',');
  const stampPath = path.join(dir, 'hosts.txt');

  const fresh =
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath) &&
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, 'utf8') === wanted;

  if (!fresh) {
    fs.mkdirSync(dir, { recursive: true });
    const sans = [
      'DNS:localhost',
      'IP:127.0.0.1',
      ...localAddresses().map((a) => `IP:${a}`),
    ].join(',');
    try {
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', keyPath, '-out', certPath,
        '-days', '825', '-subj', '/CN=lightgun.local',
        '-addext', `subjectAltName=${sans}`,
      ], { stdio: 'ignore' });
      fs.writeFileSync(stampPath, wanted);
    } catch (err) {
      return null; // caller falls back to HTTP-only
    }
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}
