/**
 * Picking up a photo or video handed to us by the OS share sheet
 * (CONTENT_SOURCING.md lane 1).
 *
 * The service worker parks the file in Cache Storage rather than in memory,
 * because the common case is "app was closed, user tapped Share in TikTok" — the
 * worker can be terminated before the page ever loads. This reads it back out
 * and clears it, so a shared file is consumed exactly once.
 */

const SHARE_CACHE = 'trendghost-share';
const SHARE_KEY = '/__shared-media';

export async function takeSharedMedia(): Promise<File | null> {
  if (typeof caches === 'undefined') return null;

  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (!response) return null;

    const blob = await response.blob();
    const name = decodeURIComponent(response.headers.get('x-share-name') ?? 'shared');
    const type = response.headers.get('content-type') ?? blob.type;

    await cache.delete(SHARE_KEY);

    if (blob.size === 0) return null;
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

/** True when this page load came from the share sheet. */
export function arrivedFromShare(): boolean {
  return new URLSearchParams(location.search).has('shared');
}
