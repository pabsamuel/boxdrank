import { expect, test, type Page } from '@playwright/test';

/**
 * These run against the built app with Chromium's synthetic camera. They prove
 * the wiring: onboarding -> camera -> model load -> render loop, plus the
 * privacy rule that nothing leaves the device on the practice path.
 */

test('onboarding explains the camera before asking for it, then reaches the library', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Copy any trend' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // CLAUDE.md rule 4: explain BEFORE the OS prompt.
  await expect(page.getByRole('heading', { name: 'About your camera' })).toBeVisible();
  await expect(page.getByText(/never uploaded/i)).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  await expect(page.getByRole('heading', { name: 'Make some space' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByRole('heading', { name: 'TrendGhost' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add your first routine' })).toBeVisible();
});

test('the add-routine screen offers the share sheet and the picker, and no URL field', async ({
  page,
}) => {
  await page.goto('/');
  await completeOnboarding(page);

  await page.getByRole('button', { name: 'Add your first routine' }).click();
  await expect(page.getByText('Choose a video or photo')).toBeVisible();
  await expect(page.getByText(/Share → TrendGhost/)).toBeVisible();

  // CONTENT_SOURCING.md "the fourth lane": there must be no way to paste a link.
  await expect(page.locator('input[type="url"]')).toHaveCount(0);
  await expect(page.locator('input[type="text"]')).toHaveCount(0);
});

test('the camera opens, the pose model loads, and the render loop runs', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/');
  await completeOnboarding(page);
  await seedRoutine(page);

  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'Practice' }).click();
  await expect(page.locator('canvas.stage')).toBeVisible();

  // The debug HUD only reports numbers once the loop has actually run a frame
  // through the camera and the model, so a non-zero inference rate proves the
  // whole path is live: getUserMedia -> PoseLandmarker -> score -> draw.
  //
  // The VALUES here are meaningless as performance data — this runs headless on
  // software GL. Real numbers come from a phone (PERFORMANCE_BUDGET.md).
  await expect
    .poll(
      async () => {
        const text = (await page.locator('.debug').textContent()) ?? '';
        return Number(/inference (\d+) Hz/.exec(text)?.[1] ?? 0);
      },
      { timeout: 90_000, message: 'inference loop should produce results' },
    )
    .toBeGreaterThan(0);

  // With no person in the fake camera feed, the coach must say so rather than
  // painting a body red (RISKS.md R3).
  await expect(page.locator('.instruction')).toContainText(/step into the frame/i);

  // RISKS.md R2 / CLAUDE.md rule 4: nothing leaves the device on this path.
  const offDevice = requests.filter(
    (url) => !url.startsWith('http://localhost:4173') && !url.startsWith('data:'),
  );
  expect(offDevice, `unexpected off-device requests: ${offDevice.join(', ')}`).toHaveLength(0);
});

/**
 * Writes a routine straight into IndexedDB so the stage can be opened without a
 * video file. Deliberately uses raw IDB rather than app code, so the test does
 * not depend on the app's own storage layer being correct.
 */
async function seedRoutine(page: Page) {
  await page.evaluate(async () => {
    const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    // A plausible standing figure in subject space (hips at the origin).
    const put = (i: number, x: number, y: number) => {
      points[i] = { x, y, z: 0, visibility: 1 };
    };
    put(0, 0, -1.35); // nose
    put(11, 0.45, -1); // left shoulder
    put(12, -0.45, -1);
    put(13, 0.75, -0.5); // elbows
    put(14, -0.75, -0.5);
    put(15, 0.95, 0); // wrists
    put(16, -0.95, 0);
    put(23, 0.3, 0); // hips
    put(24, -0.3, 0);
    put(25, 0.32, 0.85); // knees
    put(26, -0.32, 0.85);
    put(27, 0.33, 1.7); // ankles
    put(28, -0.33, 1.7);
    put(31, 0.45, 1.8); // feet
    put(32, -0.45, 1.8);

    const pose = {
      points,
      hipCenter: { x: 0.5, y: 0.55 },
      torsoLength: 0.22,
      rollAngle: 0,
      lowConfidence: false,
    };
    const frames = Array.from({ length: 60 }, (_, i) => ({
      t: i / 30,
      pose,
      confidence: 1,
    }));

    const routine = {
      id: 'e2e-routine',
      name: 'E2E routine',
      createdAt: Date.now(),
      duration: 2,
      kind: 'video',
      timeline: {
        version: 1,
        id: 'e2e-routine',
        name: 'E2E routine',
        duration: 2,
        sourceFps: 30,
        createdAt: Date.now(),
        fps: 30,
        frames,
        lowConfidenceRatio: 0,
      },
      moves: [],
      cues: [],
    };

    // The app may not have created its stores yet, and opening without a version
    // would otherwise leave an empty database behind. Create the store if needed.
    await new Promise<void>((resolve, reject) => {
      const probe = indexedDB.open('trendghost');
      probe.onerror = () => reject(probe.error);
      probe.onsuccess = () => {
        const db = probe.result;
        const hasStore = db.objectStoreNames.contains('routines');
        const version = db.version;
        db.close();

        const open = hasStore
          ? indexedDB.open('trendghost', version)
          : indexedDB.open('trendghost', version + 1);

        open.onupgradeneeded = () => {
          const upgraded = open.result;
          if (!upgraded.objectStoreNames.contains('routines')) {
            upgraded.createObjectStore('routines', { keyPath: 'id' });
          }
          if (!upgraded.objectStoreNames.contains('takes')) {
            upgraded
              .createObjectStore('takes', { keyPath: 'id' })
              .createIndex('routineId', 'routineId');
          }
          if (!upgraded.objectStoreNames.contains('settings')) {
            upgraded.createObjectStore('settings');
          }
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const ready = open.result;
          const tx = ready.transaction('routines', 'readwrite');
          tx.objectStore('routines').put(routine);
          tx.oncomplete = () => {
            ready.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      };
    });
  });
}

async function completeOnboarding(page: Page) {
  for (const label of ['Next', 'Got it', 'Start']) {
    const button = page.getByRole('button', { name: label });
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}
