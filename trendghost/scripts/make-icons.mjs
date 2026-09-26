/**
 * Rasterises the app icons.
 *
 * Android will not offer "Add to Home Screen" from an SVG alone, and that
 * install is what registers the share target — so the PNGs are not decoration,
 * they are what makes sharing into the app possible at all.
 *
 * Uses the Chromium that Playwright already provides rather than adding an
 * image dependency. The output is committed; run this only when the SVG changes.
 */

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from '@playwright/test';

const OUTPUTS = [
  { source: 'public/icon.svg', out: 'public/icon-192.png', size: 192 },
  { source: 'public/icon.svg', out: 'public/icon-512.png', size: 512 },
  { source: 'public/icon-maskable.svg', out: 'public/icon-maskable-512.png', size: 512 },
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});

try {
  for (const { source, out, size } of OUTPUTS) {
    const svg = await readFile(source, 'utf8');
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    // A transparent page so nothing of ours bleeds into the corners the icon
    // itself rounds off.
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    const png = await page.screenshot({ omitBackground: true });
    await writeFile(out, png);
    await page.close();
    console.log(`${out} (${size}x${size}, ${png.length} bytes)`);
  }
} finally {
  await browser.close();
}
