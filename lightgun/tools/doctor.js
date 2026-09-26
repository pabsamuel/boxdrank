// npm run doctor — why it is not running, in one command.
//
// Every failed attempt at this prototype so far has died in setup rather than
// in the game: the wrong git branch checked out, openssl missing on Windows,
// port 8080 taken by another project, the firewall silently dropping the
// phone, a virtual adapter's IP in the QR code. Each one produced a different
// unhelpful symptom somewhere else — "cannot read package.json", "could not
// connect to server", a page from an unrelated app.
//
// This checks all of them at once and says which one it is.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
const ok = (t, d = '') => results.push({ level: 'ok', t, d });
const warn = (t, d = '') => results.push({ level: 'warn', t, d });
const bad = (t, d = '', fix = '') => results.push({ level: 'bad', t, d, fix });

/* ------------------------------------------------------------- the checks */

async function checkProject() {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    bad('Wrong folder', 'no package.json here',
      'cd into the lightgun folder of the repository');
    return false;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== 'lightgun') {
    bad('Wrong project', `package.json says "${pkg.name}"`, 'cd into lightgun/');
    return false;
  }
  ok('Project', `lightgun v${pkg.version}`);
  return true;
}

async function checkBranch() {
  try {
    const { stdout } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
    const branch = stdout.trim();
    // The repository holds several unrelated projects on separate branches, so
    // being on the wrong one deletes lightgun/ and leaves only node_modules —
    // which looks like a corrupted install rather than a checkout problem.
    if (branch.includes('light-gun')) ok('Git branch', branch);
    else warn('Git branch', `on "${branch}" — expected the light-gun branch`);
  } catch {
    warn('Git branch', 'not a git checkout (fine if you copied the folder)');
  }
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) ok('Node', process.version);
  else bad('Node too old', process.version, 'install Node 18 or newer');
}

function checkDeps() {
  const missing = ['ws', 'qrcode', 'selfsigned']
    .filter((d) => !fs.existsSync(path.join(root, 'node_modules', d)));
  if (missing.length) bad('Dependencies missing', missing.join(', '), 'npm install');
  else ok('Dependencies', 'ws, qrcode, selfsigned installed');
}

async function checkCert() {
  try {
    const { ensureCert } = await import('../server/certs.js');
    const tls = await ensureCert();
    if (!tls) {
      bad('HTTPS certificate', 'could not be created',
        'without HTTPS the phone cannot start motion tracking at all');
      return;
    }
    const { X509Certificate } = await import('node:crypto');
    const x = new X509Certificate(tls.cert);
    ok('HTTPS certificate', `valid to ${x.validTo} · covers ${x.subjectAltName}`);
  } catch (err) {
    bad('HTTPS certificate', String(err && err.message), 'npm install');
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });
}

async function checkPorts() {
  const http = Number(process.env.LG_HTTP_PORT || 8080);
  const https = Number(process.env.LG_HTTPS_PORT || 8443);
  const httpFree = await portFree(http);
  const httpsFree = await portFree(https);
  if (httpFree) ok('Display port', String(http));
  else warn('Display port', `${http} is taken by something else — the server will use the next free port`);
  if (httpsFree) ok('Phone port', String(https));
  else warn('Phone port', `${https} is taken — the server will use the next free port`);
  return { http: httpFree ? http : http + 1, https: httpsFree ? https : https + 1 };
}

async function checkAddresses(ports) {
  const { localInterfaces, lanAddress } = await import('../server/certs.js');
  const all = localInterfaces();
  if (!all.length) {
    bad('Network', 'no network adapter found', 'connect the laptop to Wi-Fi');
    return;
  }
  const best = lanAddress();
  ok('Phone URL', `https://${best}:${ports.https}/phone`);
  const others = all.filter((i) => i.address !== best);
  if (others.length) {
    warn('Other addresses',
      `${others.map((i) => `${i.address} (${i.name}${i.virtual ? ', virtual' : ''})`).join(', ')}` +
      ' — if the phone cannot connect, switch to one of these in the display');
  }
  if (all.find((i) => i.address === best)?.virtual) {
    warn('Best guess is a virtual adapter',
      'the phone is probably not on this network — use the dropdown in the display');
  }
}

async function checkFirewall() {
  if (process.platform !== 'win32') return;
  try {
    const { stdout } = await run('netsh',
      ['advfirewall', 'firewall', 'show', 'rule', 'name=LightGun'], { timeout: 8000 });
    if (/LightGun/i.test(stdout)) {
      ok('Windows Firewall', 'a LightGun rule exists');
      return;
    }
  } catch { /* "no rules match" exits non-zero; fall through */ }
  warn('Windows Firewall',
    'no LightGun rule. If the phone cannot connect, allow Node on private networks, or run ' +
    'this once in an administrator terminal:\n      netsh advfirewall firewall add rule ' +
    'name="LightGun" dir=in action=allow protocol=TCP localport=8443');
}

/* ------------------------------------------------------------------ report */

const COLOURS = { ok: '\x1b[32m', warn: '\x1b[33m', bad: '\x1b[31m', reset: '\x1b[0m' };
const MARK = { ok: 'ok  ', warn: 'note', bad: 'FAIL' };
const paint = (level, text) =>
  process.stdout.isTTY ? `${COLOURS[level]}${text}${COLOURS.reset}` : text;

// `npm start` runs this first in brief mode: silent when everything is fine,
// loud about the one thing that is not, and it stops before the server prints
// a confusing error further downstream.
const BRIEF = process.argv.includes('--brief');

async function main() {
  if (!BRIEF) console.log('\n  LIGHTGUN — checking your setup\n');

  const projectOk = await checkProject();
  if (projectOk) {
    checkNode();
    await checkBranch();
    checkDeps();
    if (process.env.PORT) {
      // Hosted: the platform supplies the port and the certificate, so none of
      // the local networking checks apply.
      ok('Mode', `hosted on port ${process.env.PORT} — TLS handled upstream`);
    } else {
      await checkCert();
      const ports = await checkPorts();
      await checkAddresses(ports);
      await checkFirewall();
    }
  }

  const shown = BRIEF ? results.filter((r) => r.level !== 'ok') : results;
  if (shown.length) {
    if (BRIEF) console.log('');
    for (const r of shown) {
      console.log(`  ${paint(r.level, MARK[r.level])}  ${r.t.padEnd(26)} ${r.d}`);
      if (r.fix) console.log(`        → ${r.fix}`);
    }
  }

  const failures = results.filter((r) => r.level === 'bad');
  if (failures.length) {
    console.log('');
    console.log(paint('bad', `  ${failures.length} thing(s) to fix first:`));
    for (const f of failures) console.log(`    - ${f.t}: ${f.fix || f.d}`);
    console.log('');
    process.exit(1);
  }

  if (BRIEF) return;    // the server prints its own banner next
  console.log('');
  console.log(paint('ok', '  Ready. Start it with:  npm start'));
  console.log('  Then open the display on the laptop, and scan the QR with your phone.\n');
}

main().catch((err) => {
  console.error(`\n  doctor itself failed: ${err && err.stack}\n`);
  process.exit(2);
});
