import { expect, test } from '@playwright/test';

test('landing page renders the honest pitch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('emotes');
  await expect(page.getByText('not a keylogger', { exact: false })).toBeVisible();
});

test('pricing shows creator tiers', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByText('Creator Pro')).toBeVisible();
  await expect(page.getByText('14-day free trial')).toBeVisible();
});

test('magic-link request round-trips to the real API', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e@test.local');
  await page.getByRole('button', { name: /sign-in link/i }).click();
  await expect(page.getByText('Check your inbox', { exact: false })).toBeVisible();
});

test('public pack page SSRs seeded data with access badges', async ({ page }) => {
  await page.goto('/demo-creator/free-pack');
  await expect(page.getByRole('heading', { name: 'Free Pack' })).toBeVisible();
  await expect(page.getByText('Demo Creator')).toBeVisible();
  await expect(page.getByText('Free for everyone')).toBeVisible();
});

test('unknown creator 404s cleanly', async ({ page }) => {
  const response = await page.goto('/no-such-creator-xyz');
  expect(response?.status()).toBe(404);
});
