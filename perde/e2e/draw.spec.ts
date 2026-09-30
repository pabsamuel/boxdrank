import { expect, test, type Page } from '@playwright/test';

/** A drawing on paper, made in the browser: dark stick figure on cream, with one arm out. */
async function drawingPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 420;
    const g = c.getContext('2d')!;
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, 300, 420);
    g.fillStyle = '#2a1e12';
    g.beginPath();
    g.arc(150, 70, 40, 0, Math.PI * 2);
    g.fill(); // head
    g.fillRect(125, 105, 50, 150); // torso
    g.fillRect(175, 130, 90, 26); // arm to the right
    g.fillRect(118, 250, 26, 140); // left leg
    g.fillRect(156, 250, 26, 140); // right leg
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

test.describe('draw your own puppet', () => {
  test('photo → cut-out → guessed joints → preview → saved for the room', async ({ page }) => {
    await page.goto('/draw?room=ABCD&seat=p2');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Kendi kuklanı çiz|Draw your own/,
    );
    const png = await drawingPng(page);
    await page
      .getByTestId('gallery-input')
      .setInputFiles({ name: 'kukla.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.draw__canvas img')).toBeVisible({ timeout: 15_000 });
    // Guessed markers appear for all seven joints; accept them.
    await expect(page.locator('.draw__marker')).toHaveCount(7);
    await page.getByRole('button', { name: /Tahmini kullan|Use the guess/ }).click();
    await page.getByRole('button', { name: /Dene|Try it/ }).click();
    // The preview stage draws the raster puppet: an <image> clipped into parts.
    await expect(page.locator('.draw__stage image').first()).toBeVisible();
    expect(await page.locator('.draw__stage clipPath').count()).toBeGreaterThanOrEqual(4);
    await page.getByPlaceholder(/Kuklam|My puppet/).fill('Kedi');
    await page.getByRole('button', { name: /Sahneye gönder|Send to the stage/ }).click();
    await expect(page).toHaveURL(/\/join\?room=ABCD&seat=p2/);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('perde.puppets.v1') ?? '[]'),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Kedi');
    expect(stored[0].id).toMatch(/^custom:/);
    expect(stored[0].parts.map((p: { id: string }) => p.id)).toEqual([
      'body',
      'head',
      'arm',
      'leg-left',
      'leg-right',
    ]);
  });

  test('a drawn puppet reaches the TV and can be chosen from the phone menu', async ({
    browser,
    page,
    request,
  }) => {
    const created = await request.post('/api/rooms');
    const { code } = (await created.json()) as { code: string };
    const tv = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await tv.goto(`/stage?room=${code}`);
    await expect(tv.locator('.chip__code')).toHaveText(code, { timeout: 15_000 });

    await page.goto(`/draw?room=${code}&seat=p1`);
    const png = await drawingPng(page);
    await page
      .getByTestId('gallery-input')
      .setInputFiles({ name: 'kukla.png', mimeType: 'image/png', buffer: png });
    await page
      .getByRole('button', { name: /Tahmini kullan|Use the guess/ })
      .click({ timeout: 15_000 });
    await page.getByRole('button', { name: /Dene|Try it/ }).click();
    await page.getByRole('button', { name: /Sahneye gönder|Send to the stage/ }).click();
    await expect(page).toHaveURL(new RegExp(`/join\\?room=${code}&seat=p1`));
    await page.getByRole('button', { name: /Kuklayı eline al|Pick up the puppet/ }).click();
    // The phone's newest drawing is sent on welcome and becomes the seat's puppet on the TV.
    await expect(tv.locator('.stage-svg image')).toHaveCount(5, { timeout: 15_000 });
    await expect(page.locator('.controller__puppet')).toHaveText(/Kuklam|My puppet/, {
      timeout: 15_000,
    });
    await tv.close();
  });
});
