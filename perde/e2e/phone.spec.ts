import { expect, test } from '@playwright/test';

test.describe('phone', () => {
  test('join form validates the code and leads to the pick-up screen', async ({ page }) => {
    await page.goto('/join');
    const submit = page.getByRole('button', { name: /Katıl|Join/ });
    await expect(submit).toBeDisabled();
    await page.getByPlaceholder('ABCD').fill('abcd');
    await expect(page.getByPlaceholder('ABCD')).toHaveValue('ABCD');
    await submit.click();
    await expect(page).toHaveURL(/room=ABCD&seat=p1/);
    await expect(
      page.getByRole('button', { name: /Kuklayı eline al|Pick up the puppet/ }),
    ).toBeVisible();
  });

  test('a phone joins a real room and the TV leaves the lobby', async ({
    browser,
    page,
    request,
  }) => {
    const created = await request.post('/api/rooms');
    const { code } = (await created.json()) as { code: string };
    const tv = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await tv.goto(`/stage?room=${code}`);
    await expect(tv.locator('.chip__code')).toHaveText(code, { timeout: 15_000 });
    await expect(tv.locator('.lobby')).toBeVisible();

    await page.goto(`/join?room=${code}&seat=p2`);
    await page.getByRole('button', { name: /Kuklayı eline al|Pick up the puppet/ }).click();
    await expect(page.locator('.controller__puppet')).toHaveText('Hacivat', { timeout: 15_000 });
    await expect(tv.locator('.lobby')).toBeHidden({ timeout: 10_000 });

    // The host phone starts a play; both screens show the first line.
    await page.getByRole('button', { name: 'menu' }).click();
    await page.getByRole('button', { name: /Salıncak/ }).click();
    await expect(tv.locator('.karaoke__line')).toContainText('bayram geldi', { timeout: 10_000 });
    await expect(page.locator('.karaoke__line')).toContainText('bayram geldi');
    // p2 holds Hacivat, so the first line (Hacivat's) is "your line".
    await expect(page.locator('.rod')).toHaveClass(/is-mine/);
    // No buttons on the rod: a double-tap on the line counts it as said.
    await page.locator('.rod').dblclick();
    await expect(tv.locator('.karaoke__count')).toContainText('2 /');
    await tv.close();
  });
});
