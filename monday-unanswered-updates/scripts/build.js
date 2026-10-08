/**
 * Produces dist/: the bundled board view, its page, and the invented demo data
 * the view fetches when it is opened outside monday (the listing's demo link).
 * On monday code, `npm start` runs this before starting the server, which
 * serves these files by exact path. From Automation Inventory.
 */

import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The how-to page's screenshots, made by scripts/make-assets.js. */
export const IMAGES = ['welcome.png', 'list.png', 'mentions.png'];

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
await copyFile(`${root}src/app/how-to.html`, `${root}dist/how-to.html`);
await mkdir(new URL('../dist/assets/', import.meta.url), { recursive: true });
for (const image of IMAGES) await copyFile(`${root}src/app/assets/${image}`, `${root}dist/assets/${image}`);
await copyFile(`${root}fixtures/demo-updates.json`, `${root}dist/fixtures/demo-updates.json`);

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`dist/main.js   ${(bytes / 1024).toFixed(1)} kB`);
console.log('dist/index.html, dist/how-to.html, dist/assets/, dist/fixtures/demo-updates.json');
