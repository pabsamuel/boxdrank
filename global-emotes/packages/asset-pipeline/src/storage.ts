import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppEnv } from '@global-emotes/config';

/**
 * Object storage seam: S3-compatible (MinIO locally, R2/S3 in production) with
 * an in-memory implementation for tests. Protected variants are served through
 * short-lived signed URLs — never permanent public URLs (master spec §11).
 */

export interface ObjectStorage {
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: string, key: string): Promise<Buffer | null>;
  delete(bucket: string, key: string): Promise<void>;
  /** Short-lived signed GET URL for protected content. */
  signedGetUrl(bucket: string, key: string, expiresSeconds?: number): Promise<string>;
}

export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  private k(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(this.k(bucket, key), { body, contentType });
  }

  async get(bucket: string, key: string): Promise<Buffer | null> {
    return this.objects.get(this.k(bucket, key))?.body ?? null;
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.objects.delete(this.k(bucket, key));
  }

  async signedGetUrl(bucket: string, key: string, expiresSeconds = 300): Promise<string> {
    return `memory://${bucket}/${key}?expires=${expiresSeconds}`;
  }

  /** Test helper. */
  size(): number {
    return this.objects.size;
  }
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(env: AppEnv) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // required for MinIO
    });
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(bucket: string, key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async signedGetUrl(bucket: string, key: string, expiresSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresSeconds,
    });
  }
}
