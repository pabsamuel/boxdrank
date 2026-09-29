// Captures the screenshots used in README/docs from a running relay.
// Usage: pnpm build && pnpm dev:relay (in another shell) && pnpm screenshots
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.env.PERDE_BASE_URL ?? 'http://127.0.0.1:8787';
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PERDE_CHROMIUM_PATH || undefined,
});

const tv = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await tv.goto(`${base}/stage?demo=1`);
await tv.waitForSelector('.karaoke__line');
await tv.waitForTimeout(1500);
await tv.screenshot({ path: `${out}stage-demo.png` });
await tv.goto(`${base}/stage`);
await tv.waitForSelector('.seat svg');
await tv.screenshot({ path: `${out}stage-lobby.png` });
await tv.goto(`${base}/stage?demo=1&culture=en`);
await tv.waitForTimeout(1500);
await tv.screenshot({ path: `${out}stage-demo-en.png` });
await tv.goto(`${base}/`);
await tv.waitForTimeout(800);
await tv.screenshot({ path: `${out}landing.png` });

const { code } = await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json();
const tv2 = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await tv2.goto(`${base}/stage?room=${code}`);
await tv2.waitForSelector('.seat svg');
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const phone = await ctx.newPage();
await phone.goto(`${base}/join?room=${code}&seat=p1`);
await phone.screenshot({ path: `${out}phone-pickup.png` });
await phone.getByRole('button', { name: /Kuklayı eline al|Pick up/ }).click();
await phone.waitForSelector('.controller__puppet');
await phone.getByRole('button', { name: '☰' }).click();
await phone.getByRole('button', { name: /Yâr Bana/ }).click();
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${out}phone-controller.png` });
await tv2.waitForTimeout(500);
await tv2.screenshot({ path: `${out}stage-live.png` });
await browser.close();
console.log(`screenshots written to ${out}`);
