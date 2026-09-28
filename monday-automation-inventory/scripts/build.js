/**
 * Produces dist/: the bundled board view, its page, and the invented demo data
 * the view fetches when it is opened outside monday (the listing's demo link).
 * On monday code, `npm start` runs this before starting the server, which
 * serves these files by exact path. From Automation Watchdog.
 */

import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await mkdir(new URL('../dist/fixtures/', import.meta.url), { recursive: true });

const result = await build({
  entryPoints: [`${root}src/app/main.js`],
  outfile: `${root}dist/main.js`,
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  metafile: true,
});

await copyFile(`${root}src/app/index.html`, `${root}dist/index.html`);
await copyFile(`${root}fixtures/demo-automations.json`, `${root}dist/fixtures/demo-automations.json`);

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`dist/main.js   ${(bytes / 1024).toFixed(1)} kB`);
console.log('dist/index.html, dist/fixtures/demo-automations.json');
