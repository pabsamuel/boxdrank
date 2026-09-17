import { expect, test, type Page } from '@playwright/test';

// Browser console and page errors are the fastest way to see why a run diverged;
// without them a timing failure just looks like a timeout.
test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    console.log(`[browser:${message.type()}] ${message.text().slice(0, 200)}`);
  });
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message.slice(0, 200)}`));
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const visible = await page
    .locator('body')
    .innerText()
    .catch(() => '(could not read page)');
  console.log(`\n[failed: what was actually on screen]\n${visible.slice(0, 600)}\n`);
});

/**
 * These run against the built app with Chromium's synthetic camera. They prove
 * the wiring: onboarding -> camera -> model load -> render loop, plus the
 * privacy rule that nothing leaves the device on the practice path.
 */

test('onboarding explains the camera before asking for it, then reaches the library', async ({
  page,
}) => {
  await page.goto('./');

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
  await page.goto('./');
  await completeOnboarding(page);

  await page.getByRole('button', { name: 'Add your first routine' }).click();
  await expect(page.getByText('Choose a video or photo')).toBeVisible();
  await expect(page.getByText(/Share → TrendGhost/)).toBeVisible();

  // CONTENT_SOURCING.md "the fourth lane": there must be no way to paste a link.
  await expect(page.locator('input[type="url"]')).toHaveCount(0);
  await expect(page.locator('input[type="text"]')).toHaveCount(0);
});

test('the camera opens, the pose model loads, and the render loop runs', async ({
  page,
  baseURL,
}) => {
  const ownOrigin = new URL(baseURL ?? 'http://localhost:4173/').origin;
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('./');
  await completeOnboarding(page);
  // The library mounting is what makes the app create its database; wait for it
  // before seeding, or the seed races app startup.
  await expect(page.getByRole('heading', { name: 'TrendGhost' })).toBeVisible();
  await seedRoutine(page, './?debug=1');
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
    (url) => !url.startsWith(ownOrigin) && !url.startsWith('data:'),
  );
  expect(offDevice, `unexpected off-device requests: ${offDevice.join(', ')}`).toHaveLength(0);
});

/**
 * Writes a routine straight into IndexedDB so the stage can be opened without a
 * video file. Deliberately uses raw IDB rather than app code, so the test does
 * not depend on the app's own storage layer being correct.
 */
async function seedRoutine(page: Page, reloadTo = './') {
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

    // Wait for the app itself to create its object stores (it does so the first
    // time the library reads routines), then write into them. Creating the store
    // ourselves races the app's own upgrade and leaves a half-built database.
    // Crucially, do NOT call indexedDB.open() until the app's database exists:
    // opening a database that isn't there CREATES it, empty and at version 1,
    // which permanently blocks the app's own upgrade from ever running. Poll the
    // database list instead, which is read-only.
    const deadline = Date.now() + 15_000;
    for (;;) {
      const databases = await indexedDB.databases();
      if (databases.some((entry) => entry.name === 'trendghost')) break;
      if (Date.now() > deadline) throw new Error('app never created its IndexedDB');
      await new Promise((r) => setTimeout(r, 100));
    }

    await new Promise<void>((resolve, reject) => {
      const attempt = () => {
        const request = indexedDB.open('trendghost');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('routines')) {
            db.close();
            if (Date.now() > deadline) {
              reject(new Error('app never created its IndexedDB stores'));
              return;
            }
            setTimeout(attempt, 100);
            return;
          }
          const tx = db.transaction('routines', 'readwrite');
          tx.objectStore('routines').put(routine);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      };

      attempt();
    });
  });

  // The library only re-reads on mount, so reload and wait for the routine to
  // actually be on screen before the test carries on.
  await gotoApp(page, reloadTo);
  await expect(page.getByText('E2E routine')).toBeVisible();
}

/**
 * The service worker is what receives a share, so it must be CONTROLLING the page
 * before we post to it. `navigator.serviceWorker.ready` resolves once a worker is
 * activated, which is earlier — a POST made in that window goes to the network
 * instead and the share is silently missed.
 */
/**
 * Navigate, then step through onboarding if it appears.
 *
 * Settings are persisted asynchronously, so a reload soon after finishing
 * onboarding can legitimately land before that write completes and show the
 * onboarding again. That is a real (minor) app behaviour, not a test bug, so the
 * tests tolerate it rather than pretending it cannot happen.
 */
async function gotoApp(page: Page, url: string) {
  await page.goto(url);
  await completeOnboarding(page);
}

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  });
  // A worker that activated after this page loaded only controls it from the next
  // navigation, so reload and confirm control before posting.
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

/**
 * Click through onboarding, however many steps it has.
 *
 * Do NOT check isVisible() and then click: onboarding can finish rendering away
 * in the gap between the two, and the click then waits the full test timeout for
 * a button that no longer exists. (That race produced a two-minute "timeout" on a
 * screen that had simply moved on — the page dump showed the library.)
 *
 * Instead, attempt each click with a short timeout and treat "not there" as
 * "onboarding is done", then assert it really is gone.
 */
async function completeOnboarding(page: Page) {
  const onboarding = page.locator('.onboarding');

  // Short timeout on purpose: this is a local static app, so if onboarding is
  // going to appear it appears well within a second. A long timeout here is paid
  // on every navigation where onboarding is (correctly) absent — it cost ~30s a
  // run before this was tuned down.
  for (let step = 0; step < 6; step += 1) {
    try {
      await onboarding.getByRole('button').first().click({ timeout: 1_500 });
    } catch {
      break;
    }
  }

  await expect(onboarding, 'onboarding should be finished').toBeHidden();
}

/**
 * The share flow (CONTENT_SOURCING.md lane 1), exercised the way the OS does it:
 * a multipart POST to /share-target handled by the service worker, with the app
 * closed. The file must survive that handoff and start processing by itself.
 */
test('a photo shared from another app lands in TrendGhost and starts processing', async ({
  page,
}) => {
  await page.goto('./');
  await completeOnboarding(page);

  await waitForServiceWorkerControl(page);

  // A real 1x1 PNG, posted exactly as the OS share sheet posts one.
  const redirected = await page.evaluate(async () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append(
      'media',
      new File([bytes], 'trend-pose.png', { type: 'image/png' }),
      'trend-pose.png',
    );
    const response = await fetch('share-target', { method: 'POST', body: form });
    return response.url;
  });

  expect(redirected, 'share target should redirect back into the app').toContain('shared=1');

  // Now open the app the way the redirect would, with no file picked by hand.
  await gotoApp(page, './?shared=1');

  // It should be on the ingest screen working on the shared file — and because a
  // 1x1 PNG has no person in it, it should say so plainly rather than inventing
  // a routine (PRODUCT_SPEC.md "honest rejection").
  await expect(page.getByText("I couldn't find a person in that photo.")).toBeVisible({
    timeout: 60_000,
  });
});

test('a shared file is consumed once, not replayed on every reload', async ({ page }) => {
  await page.goto('./');
  await completeOnboarding(page);
  await waitForServiceWorkerControl(page);

  await page.evaluate(async () => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    );
    const form = new FormData();
    form.append(
      'media',
      new File([bytes], 'trend-pose.png', { type: 'image/png' }),
      'trend-pose.png',
    );
    await fetch('share-target', { method: 'POST', body: form });
  });

  await gotoApp(page, './?shared=1');
  await expect(page.getByText("I couldn't find a person in that photo.")).toBeVisible({
    timeout: 60_000,
  });

  // Reload: the share must be gone, and we should be back in the library.
  await gotoApp(page, './');
  await expect(page.getByRole('heading', { name: 'TrendGhost' })).toBeVisible();
});
