// WebXR needs a secure context, and a phone on the LAN is not "localhost", so
// the controller has to be served over HTTPS. We mint a long-lived self-signed
// certificate once, covering every local IP we can see, and cache it.
//
// This is done in pure JavaScript rather than by shelling out to `openssl`,
// because openssl is not on PATH on a stock Windows machine — and there,
// silently falling back to HTTP means WebXR refuses to start and the whole
// light gun looks broken for a reason nothing on screen explains.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

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

export async function ensureCert() {
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const stampPath = path.join(dir, 'hosts.txt');
  // Re-mint when the machine's addresses change, or the phone will reject the
  // certificate for the address it actually dialled.
  const wanted = ['localhost', ...localAddresses()].join(',');

  const fresh =
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath) &&
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, 'utf8') === wanted;

  if (fresh) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }

  const altNames = [
    { type: 2, value: 'localhost' },          // 2 = DNS name
    { type: 7, ip: '127.0.0.1' },             // 7 = IP address
    ...localAddresses().map((ip) => ({ type: 7, ip })),
  ];

  try {
    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: 'lightgun.local' }],
      {
        keySize: 2048,
        algorithm: 'sha256',
        notAfterDate: new Date(Date.now() + 825 * 24 * 60 * 60 * 1000),
        extensions: [{ name: 'subjectAltName', altNames }],
      },
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(stampPath, wanted);
    return { key: pems.private, cert: pems.cert };
  } catch (err) {
    console.error(`  !! could not create a certificate: ${err && err.message}`);
    return null;
  }
}
