import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  AssetValidationError,
  detectFormat,
  generateVariants,
  hashContent,
  validateAsset,
  variantKey,
} from './index';

async function makePng(width = 128, height = 128): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 30, b: 90, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

/** Author a real multi-frame GIF via sharp's join feature (v0.33+). */
async function makeAnimatedGif(frames: number, size: number): Promise<Buffer> {
  const inputs: Buffer[] = [];
  for (let i = 0; i < frames; i++) {
    inputs.push(
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: (i * 80) % 255, g: 120, b: 200, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
  }
  return sharp(inputs, { join: { animated: true } })
    .gif({ delay: 100 })
    .toBuffer();
}

describe('detectFormat', () => {
  it('detects png/jpeg/webp/gif by magic bytes and rejects junk', async () => {
    const png = await makePng();
    expect(detectFormat(png)).toBe('png');
    const jpeg = await sharp(png).jpeg().toBuffer();
    expect(detectFormat(jpeg)).toBe('jpeg');
    const webp = await sharp(png).webp().toBuffer();
    expect(detectFormat(webp)).toBe('webp');
    const gif = await sharp(png).gif().toBuffer();
    expect(detectFormat(gif)).toBe('gif');
    expect(detectFormat(Buffer.from('#!/bin/sh\necho hi'))).toBeNull();
  });
});

describe('validateAsset', () => {
  it('accepts a valid static PNG and reports dimensions + hash', async () => {
    const png = await makePng(128, 96);
    const v = await validateAsset(png, { claimedMimeType: 'image/png' });
    expect(v).toMatchObject({
      format: 'png',
      width: 128,
      height: 96,
      animated: false,
      frameCount: 1,
    });
    expect(v.contentHash).toBe(hashContent(png));
  });

  it('rejects MIME spoofing (claimed png, actual jpeg)', async () => {
    const jpeg = await sharp(await makePng()).jpeg().toBuffer();
    await expect(validateAsset(jpeg, { claimedMimeType: 'image/png' })).rejects.toMatchObject({
      code: 'mime_mismatch',
    });
  });

  it('rejects executables and junk', async () => {
    await expect(validateAsset(Buffer.from('MZ\x90\x00junkjunkjunk'))).rejects.toMatchObject({
      code: 'unsupported_format',
    });
  });

  it('enforces dimension limits both ways', async () => {
    const tiny = await makePng(8, 8);
    await expect(validateAsset(tiny)).rejects.toMatchObject({ code: 'bad_dimensions' });
    const huge = await makePng(2000, 200);
    await expect(validateAsset(huge)).rejects.toMatchObject({ code: 'bad_dimensions' });
  });

  it('enforces byte-size limit', async () => {
    const png = await makePng(512, 512);
    await expect(
      validateAsset(png, { limits: { maxUploadBytes: 100 } }),
    ).rejects.toMatchObject({ code: 'too_large' });
  });

  it('detects animation, per-frame dimensions and duration in animated gif', async () => {
    const animated = await makeAnimatedGif(3, 64);
    const v = await validateAsset(animated, { claimedMimeType: 'image/gif' });
    expect(v.animated).toBe(true);
    expect(v.frameCount).toBe(3);
    expect(v.width).toBe(64);
    expect(v.height).toBe(64); // per-frame height, not the stacked strip
    expect(v.durationMs).toBeGreaterThan(0);
  });

  it('enforces the animation frame limit', async () => {
    const animated = await makeAnimatedGif(4, 64);
    await expect(
      validateAsset(animated, { limits: { maxAnimationFrames: 2 } }),
    ).rejects.toMatchObject({ code: 'too_many_frames' });
  });
});

describe('generateVariants', () => {
  it('produces all delivery variants as square webp with stripped metadata', async () => {
    const png = await makePng(300, 100);
    const validated = await validateAsset(png);
    const variants = await generateVariants(png, validated);
    const kinds = variants.map((v) => v.kind).sort();
    expect(kinds).toEqual(
      ['keyboard', 'low_bandwidth', 'share', 'telegram', 'thumbnail', 'web_preview'].sort(),
    );
    for (const v of variants) {
      expect(v.mimeType).toBe('image/webp');
      const meta = await sharp(v.buffer).metadata();
      expect(meta.width).toBe(v.width);
      expect(meta.height).toBe(v.height);
      expect(meta.exif).toBeUndefined(); // metadata stripped by re-encode
    }
    const telegram = variants.find((v) => v.kind === 'telegram');
    expect(telegram?.width).toBe(512); // Telegram sticker requirement
  });

  it('derives deterministic content-addressed storage keys', async () => {
    const png = await makePng();
    const hash = hashContent(png);
    expect(variantKey(hash, 'keyboard')).toBe(
      `emotes/${hash.slice(0, 2)}/${hash}/keyboard.webp`,
    );
  });
});

describe('error taxonomy', () => {
  it('exposes stable error codes for the API layer', () => {
    const err = new AssetValidationError('too_large', 'x');
    expect(err.code).toBe('too_large');
    expect(err.name).toBe('AssetValidationError');
  });
});
