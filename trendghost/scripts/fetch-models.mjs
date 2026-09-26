/**
 * Downloads the MediaPipe pose models and WASM runtime into public/models so the
 * app serves them itself — no CDN dependency at runtime (CLAUDE.md rule, DECISIONS.md D11).
 *
 * Run once after cloning:  npm run fetch-models
 */

import { mkdir, writeFile, readdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');

const MODELS = {
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const [name, url] of Object.entries(MODELS)) {
    const target = join(outDir, name);
    if (existsSync(target)) {
      console.log(`✓ ${name} already present`);
      continue;
    }
    process.stdout.write(`↓ ${name} … `);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`failed (${response.status})`);
      process.exitCode = 1;
      continue;
    }
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log('done');
  }

  // The WASM runtime ships inside the npm package — copy it rather than fetching.
  const wasmSource = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const wasmTarget = join(outDir, 'wasm');
  if (existsSync(wasmSource)) {
    await mkdir(wasmTarget, { recursive: true });
    for (const file of await readdir(wasmSource)) {
      await cp(join(wasmSource, file), join(wasmTarget, file));
    }
    console.log('✓ wasm runtime copied');
  } else {
    console.error('! @mediapipe/tasks-vision not installed — run npm install first');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
