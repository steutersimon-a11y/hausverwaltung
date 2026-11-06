import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ApiError } from './http';
import { MAX_DOCUMENT_BYTES } from './upload-validation';
export { MAX_DOCUMENT_BYTES, inspectUpload, safeFilename } from './upload-validation';

let client: S3Client | undefined;
let bucketReady: Promise<void> | undefined;
function config() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET ?? 'atlas-private';
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new ApiError('STORAGE_NOT_CONFIGURED', 503, 'Der private Dokumentenspeicher ist noch nicht eingerichtet.');
  const parsed = new URL(endpoint);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new ApiError('STORAGE_NOT_CONFIGURED', 503, 'Ungültige Speicherkonfiguration.');
  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && process.env.ATLAS_ALLOW_LOCAL_HTTP === 'true';
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !localHttp) throw new ApiError('STORAGE_NOT_CONFIGURED', 503, 'Der Dokumentenspeicher benötigt HTTPS.');
  client ??= new S3Client({ endpoint, region: process.env.S3_REGION ?? 'us-east-1', forcePathStyle: true, maxAttempts: 3, credentials: { accessKeyId, secretAccessKey } });
  return { client, bucket };
}

export async function ensurePrivateBucket(): Promise<void> {
  if (bucketReady) return bucketReady;
  const { client, bucket } = config();
  bucketReady = (async () => {
    try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch (error) {
      const failure = error as { $metadata?: { httpStatusCode?: number }; name?: string };
      if (failure.$metadata?.httpStatusCode !== 404 && failure.name !== 'NotFound' && failure.name !== 'NoSuchBucket') throw error;
      try { await client.send(new CreateBucketCommand({ Bucket: bucket })); }
      catch (createError) { if ((createError as { name?: string }).name !== 'BucketAlreadyOwnedByYou') throw createError; }
    }
  })();
  try { await bucketReady; }
  catch { bucketReady = undefined; throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Der private Dokumentenspeicher ist gerade nicht erreichbar.'); }
}

export async function putPrivateFile(bytes: Uint8Array, mimeType: string, organizationId: string): Promise<{ key: string; sha256: string }> {
  await ensurePrivateBucket();
  const { client, bucket } = config();
  const key = `${organizationId}/${randomUUID()}`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: mimeType, Metadata: { sha256 } }));
    return { key, sha256 };
  } catch { throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Die Datei konnte nicht im privaten Speicher abgelegt werden.'); }
}

export async function getPrivateFile(key: string): Promise<Uint8Array> {
  const { client, bucket } = config();
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error('Empty S3 body');
    if (response.ContentLength && response.ContentLength > MAX_DOCUMENT_BYTES) throw new Error('Invalid stored file length');
    const bytes = await response.Body.transformToByteArray();
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Invalid stored file length');
    return bytes;
  } catch { throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Die Datei konnte nicht aus dem privaten Speicher geladen werden.'); }
}

/** Only compensating cleanup of a failed new upload; historic versions are never deleted here. */
export async function deletePrivateFile(key: string): Promise<void> {
  const { client, bucket } = config();
  try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
  catch { console.error(JSON.stringify({ event: 'atlas.storage.compensation_failed' })); }
}
