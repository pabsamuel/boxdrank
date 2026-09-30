import { expect, test } from '@playwright/test';

test.describe('landing', () => {
  test('renders the hero with a moving stage and both entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Televizyonda aç|Open on the TV/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Telefonla katıl|Join with a phone/ }).first(),
    ).toBeVisible();
    // The hero stage stays inside its box instead of covering the page.
    const box = await page.locator('.hero__stage').boundingBox();
    expect(box && box.height < 700).toBeTruthy();
    await expect(page.locator('.hero__stage svg')).toBeVisible();
    // Puppets are drawn as groups of paths (patterns and clips live in <defs>).
    expect(await page.locator('.hero__stage svg g path').count()).toBeGreaterThan(10);
    await expect(page.locator('#pricing')).toContainText('Perde Plus');
  });
});

test.describe('stage', () => {
  test('creates a room and shows four QR seats in the lobby', async ({ page }) => {
    await page.goto('/stage');
    const chip = page.locator('.chip__code');
    await expect(chip).toHaveText(/^[A-Z]{4}$/, { timeout: 15_000 });
    await expect(page.locator('.seat')).toHaveCount(4);
    await expect(page.locator('.seat svg')).toHaveCount(4);
    await expect(page.locator('.lobby__title')).toContainText(/Karagöz/);
    // The göstermelik hangs on the screen until the first puppeteer steps up.
    await expect(page.locator('image[href*="gostermelik"]')).toHaveCount(1);
  });

  test('demo mode runs the opening play with karaoke lines', async ({ page }) => {
    await page.goto('/stage?demo=1');
    await expect(page.locator('.karaoke__line')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.karaoke__speaker')).toHaveText('Hacivat');
    const firstLine = await page.locator('.karaoke__line').innerText();
    expect(firstLine).toContain('Perde kuruldu');
    // Two puppets are on stage (Karagöz and Hacivat), each a group of paths.
    expect(await page.locator('.stage-svg > g > g').count()).toBeGreaterThanOrEqual(2);
    // Lines advance by themselves in demo mode.
    await expect(page.locator('.karaoke__count')).toContainText('2 /', { timeout: 8_000 });
  });

  test('api health and room lifecycle', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    const created = await request.post('/api/rooms');
    expect(created.status()).toBe(201);
    const { code } = (await created.json()) as { code: string };
    expect(code).toMatch(/^[A-Z]{4}$/);
    const info = await request.get(`/api/rooms/${code}`);
    expect(await info.json()).toMatchObject({ code, stage: false, controllers: [] });
    const missing = await request.get('/api/rooms/QQQQ');
    expect(missing.status()).toBe(404);
  });
});
