/**
 * Produces a deployable dist/ folder: the bundled app plus the page that loads
 * it. index.html already points at "./main.js", which is what esbuild writes
 * here, so the page is copied rather than rewritten.
 *
 * The board view is the whole of dist/. On monday code, `npm start` runs this
 * before starting the server, which serves these files under /view/.
 */

import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Invented demo data the view fetches when it is not inside monday. */
export const DEMO_FILES = ['demo-activity.json', 'demo-automations.json'];

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });

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
for (const image of ['board-view.png', 'alert-email.png']) {
  await copyFile(`${root}src/app/assets/${image}`, `${root}dist/assets/${image}`);
}

// The demo data, for the view opened outside monday (the listing's demo link).
// main.js asks for it at `../../fixtures/…` from its own URL, which is
// /fixtures/… when the view is served under /view/. Until 28 Sep it was not
// in dist/, so the live demo link answered 404 and the view showed an error.
await mkdir(new URL('../dist/fixtures/', import.meta.url), { recursive: true });
for (const file of DEMO_FILES) {
  if (existsSync(`${root}fixtures/${file}`)) await copyFile(`${root}fixtures/${file}`, `${root}dist/fixtures/${file}`);
}

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`dist/main.js   ${(bytes / 1024).toFixed(1)} kB`);
console.log('dist/index.html, dist/how-to.html, dist/assets/, dist/fixtures/');
console.log('\ndist/ is the whole app — host it and point the monday board view at it.');
