/**
 * Runs the browser smoke suite against the GitHub Pages build.
 *
 * Pages serves the app from /<repo>/, not the domain root, and that changes the
 * service worker's scope and the share-target URL — exactly the things the
 * smoke tests cover. Building at "/" and hoping the sub-path works has already
 * been the kind of assumption this project got bitten by, so check it directly.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const BASE = '/boxdrank/trendghost/';
const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`${url} never came up`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

await run('npm', ['run', 'build'], { BASE_PATH: BASE });

const preview = spawn('npx', ['vite', 'preview', '--base', BASE, '--port', String(PORT)], {
  stdio: 'inherit',
});

let failure;
try {
  await waitForServer(ORIGIN + BASE);
  await run('npx', ['playwright', 'test'], { E2E_BASE_URL: ORIGIN + BASE });
} catch (error) {
  failure = error;
} finally {
  preview.kill();
}

if (failure) {
  console.error(failure.message);
  process.exit(1);
}
