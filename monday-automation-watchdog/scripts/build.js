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
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

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

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`dist/main.js   ${(bytes / 1024).toFixed(1)} kB`);
console.log('dist/index.html');
console.log('\ndist/ is the whole app — host it and point the monday board view at it.');
