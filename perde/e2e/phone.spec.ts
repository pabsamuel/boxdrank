import { expect, test } from '@playwright/test';

test.describe('phone', () => {
  test('a wrong code is caught on the form and every screen has a way back', async ({
    page,
    request,
  }) => {
    await page.goto('/join');
    const submit = page.getByRole('button', { name: /Katıl|Join/ });
    await expect(submit).toBeDisabled();
    // A code no TV ever showed: the form says so and stays put.
    await page.getByPlaceholder('ABCD').fill('zzzz');
    await expect(page.getByPlaceholder('ABCD')).toHaveValue('ZZZZ');
    await submit.click();
    await expect(page.getByRole('alert')).toContainText(/oda yok|no room/i);
    await expect(page).not.toHaveURL(/room=/);

    // A real room leads to the pick-up screen, and "change the code" leads back
    // with the letters still in the box.
    const created = await request.post('/api/rooms');
    const { code } = (await created.json()) as { code: string };
    await page.getByPlaceholder('ABCD').fill(code);
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`room=${code}&seat=p1`));
    await expect(
      page.getByRole('button', { name: /Kuklayı eline al|Pick up the puppet/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Kodu değiştir|Change the code/ }).click();
    await expect(page).not.toHaveURL(/room=/);
    await expect(page.getByPlaceholder('ABCD')).toHaveValue(code);

    // A stale link (QR from a closed TV) is not a trap either.
    await page.goto('/join?room=ZZZZ&seat=p1');
    await expect(page.getByRole('alert')).toContainText(/oda yok|no room/i);
    await expect(
      page.getByRole('button', { name: /Kuklayı eline al|Pick up the puppet/ }),
    ).toBeDisabled();
    await page.getByRole('button', { name: /Kodu değiştir|Change the code/ }).click();
    await expect(page.getByPlaceholder('ABCD')).toHaveValue('ZZZZ');
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
    // A reloaded TV picks the play back up where it was, with the phone still on.
    await tv.reload();
    await expect(tv.locator('.karaoke__count')).toContainText('2 /', { timeout: 15_000 });
    await expect(tv.locator('.lobby')).toBeHidden();
    await expect(page.locator('.controller__puppet')).toHaveText('Hacivat', { timeout: 15_000 });
    await expect(page.locator('.karaoke__line')).toBeVisible();
    // The menu always offers the door.
    await page.getByRole('button', { name: 'menu' }).click();
    await page.getByRole('button', { name: /Odadan çık|Leave the room/ }).click();
    await expect(page.getByPlaceholder('ABCD')).toHaveValue(code);
    await tv.close();
  });
});
