import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ASSET_LIMITS } from '@global-emotes/config';
import type { EmoteVariant } from '@global-emotes/contracts';

/**
 * Asset pipeline (master spec §11): magic-byte MIME validation, size/dimension/
 * frame limits, metadata stripping, content hashing for dedupe, and delivery
 * variant generation. Pure functions over buffers — storage I/O stays in the
 * worker driver.
 */

export type DetectedFormat = 'png' | 'jpeg' | 'webp' | 'gif';

export interface ValidatedAsset {
  format: DetectedFormat;
  mimeType: string;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  animated: boolean;
  bytes: number;
  contentHash: string;
}

export class AssetValidationError extends Error {
  constructor(
    public readonly code:
      | 'unsupported_format'
      | 'mime_mismatch'
      | 'too_large'
      | 'bad_dimensions'
      | 'too_many_frames'
      | 'too_long'
      | 'decode_failed'
      | 'decompression_bomb',
    message: string,
  ) {
    super(message);
    this.name = 'AssetValidationError';
  }
}

/** Magic-byte sniffing — never trust the extension or client MIME (spec §11.2). */
export function detectFormat(buffer: Buffer): DetectedFormat | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'gif';
  return null;
}

const FORMAT_MIME: Record<DetectedFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export interface AssetLimitOverrides {
  maxUploadBytes?: number;
  maxDimension?: number;
  minDimension?: number;
  maxAnimationFrames?: number;
  maxAnimationDurationMs?: number;
}

export interface ValidateOptions {
  claimedMimeType?: string;
  limits?: AssetLimitOverrides;
}

export async function validateAsset(
  buffer: Buffer,
  options: ValidateOptions = {},
): Promise<ValidatedAsset> {
  const limits = { ...ASSET_LIMITS, ...options.limits };

  if (buffer.length > limits.maxUploadBytes) {
    throw new AssetValidationError('too_large', `upload exceeds ${limits.maxUploadBytes} bytes`);
  }

  const format = detectFormat(buffer);
  if (!format) throw new AssetValidationError('unsupported_format', 'unrecognized file signature');
  const mimeType = FORMAT_MIME[format];
  if (options.claimedMimeType && options.claimedMimeType !== mimeType) {
    throw new AssetValidationError(
      'mime_mismatch',
      `claimed ${options.claimedMimeType} but content is ${mimeType}`,
    );
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { animated: true, limitInputPixels: 4096 * 4096 }).metadata();
  } catch (err) {
    const message = String(err);
    if (message.includes('pixel limit')) {
      throw new AssetValidationError('decompression_bomb', 'image exceeds pixel safety limit');
    }
    throw new AssetValidationError('decode_failed', `could not decode image: ${message}`);
  }

  const frameCount = meta.pages ?? 1;
  const width = meta.width ?? 0;
  // For animated images sharp reports total height of all frames; pageHeight is per-frame.
  const height = frameCount > 1 ? (meta.pageHeight ?? 0) : (meta.height ?? 0);

  if (width < limits.minDimension || height < limits.minDimension) {
    throw new AssetValidationError('bad_dimensions', `minimum ${limits.minDimension}px per side`);
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    throw new AssetValidationError('bad_dimensions', `maximum ${limits.maxDimension}px per side`);
  }
  if (frameCount > limits.maxAnimationFrames) {
    throw new AssetValidationError('too_many_frames', `maximum ${limits.maxAnimationFrames} frames`);
  }

  const delays: number[] = Array.isArray(meta.delay) ? meta.delay : [];
  const durationMs = delays.reduce((total, d) => total + (Number.isFinite(d) ? d : 0), 0);
  if (durationMs > limits.maxAnimationDurationMs) {
    throw new AssetValidationError('too_long', `maximum ${limits.maxAnimationDurationMs}ms animation`);
  }

  return {
    format,
    mimeType,
    width,
    height,
    frameCount,
    durationMs,
    animated: frameCount > 1,
    bytes: buffer.length,
    contentHash: hashContent(buffer),
  };
}

export function hashContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ── Variant generation ────────────────────────────────────────────────────────

export interface GeneratedVariant {
  kind: EmoteVariant['kind'];
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

interface VariantSpec {
  kind: EmoteVariant['kind'];
  size: number;
  /** Keep animation when the source is animated. */
  preserveAnimation: boolean;
  quality: number;
}

const VARIANT_SPECS: VariantSpec[] = [
  { kind: 'web_preview', size: 112, preserveAnimation: true, quality: 80 },
  { kind: 'keyboard', size: 96, preserveAnimation: true, quality: 75 },
  { kind: 'share', size: 512, preserveAnimation: true, quality: 90 },
  { kind: 'telegram', size: 512, preserveAnimation: false, quality: 90 },
  { kind: 'low_bandwidth', size: 48, preserveAnimation: false, quality: 60 },
  { kind: 'thumbnail', size: 32, preserveAnimation: false, quality: 60 },
];

/**
 * Generate normalized WebP variants (static or animated), metadata stripped by
 * re-encoding. Transparent padding preserves aspect ratio in a square canvas.
 */
export async function generateVariants(
  buffer: Buffer,
  validated: ValidatedAsset,
): Promise<GeneratedVariant[]> {
  const variants: GeneratedVariant[] = [];
  for (const spec of VARIANT_SPECS) {
    const animate = validated.animated && spec.preserveAnimation;
    const pipeline = sharp(buffer, { animated: animate })
      .resize(spec.size, spec.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: spec.quality, effort: 4 });
    const out = await pipeline.toBuffer();
    variants.push({
      kind: spec.kind,
      buffer: out,
      mimeType: 'image/webp',
      width: spec.size,
      height: spec.size,
    });
  }
  return variants;
}

/** Object storage keys, addressed by content hash for free deduplication. */
export function variantKey(contentHash: string, kind: EmoteVariant['kind']): string {
  return `emotes/${contentHash.slice(0, 2)}/${contentHash}/${kind}.webp`;
}

export function originalKey(contentHash: string, format: DetectedFormat): string {
  return `originals/${contentHash.slice(0, 2)}/${contentHash}.${format}`;
}
