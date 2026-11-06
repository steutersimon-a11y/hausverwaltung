import { describe, expect, it } from 'vitest';
import { inspectUpload, MAX_DOCUMENT_BYTES, safeFilename } from '../../apps/web/src/lib/server/upload-validation';
import { readLimitedBytes } from '../../apps/web/src/lib/server/http';

// Generated 2×3 solid-color images. They contain no property or person data.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFUlEQVR4nGN8/uouAwMDEwMDA4ICADNIArT7sdOCAAAAAElFTkSuQmCC';
const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD2iiiisgP/2Q==';
const webps = [
  'UklGRigAAABXRUJQVlA4IBwAAAAwAQCdASoCAAMAAUAmJZQAA3AA/vtMY+g+K+AA',
  'UklGRh4AAABXRUJQVlA4TBEAAAAvAYAAEAdQ9Z63u3iBiOh/AAA=',
  'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAQAAAgAAQUxQSAcAAAAAeHh4eHh4AFZQOCAcAAAAMAEAnQEqAgADAAFAJiWUAANwAP77TGPoPivgAA==',
];
const bytes = (value: string) => Buffer.from(value, 'base64');

describe('private document validation', () => {
  it.each([[png, 'test.png', 'image/png'], [jpeg, 'test.jpeg', 'image/jpeg'], ...webps.map(image => [image, 'test.webp', 'image/webp'])])('accepts genuine small %s', async (data, name, mime) => {
    const result = await inspectUpload(new File([bytes(data!)], name!, { type: mime! }));
    expect(result.mimeType).toBe(mime);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });
  it('rejects HTML renamed as a PDF', async () => {
    await expect(inspectUpload(new File(['<html><script>window.evil=true</script></html>'], 'test.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ status: 415 });
  });
  it('rejects SVG active content', async () => {
    await expect(inspectUpload(new File(['<svg onload="alert(1)"></svg>'], 'plan.svg', { type: 'image/svg+xml' }))).rejects.toMatchObject({ status: 415 });
  });
  it('rejects a mismatched declared content type', async () => {
    await expect(inspectUpload(new File([bytes(png)], 'test.png', { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'FILE_TYPE' });
  });
  it('rejects a mismatched extension', async () => {
    await expect(inspectUpload(new File([bytes(png)], 'test.pdf', { type: 'image/png' }))).rejects.toMatchObject({ code: 'FILE_EXTENSION' });
  });
  it('does not accept an incomplete PDF', async () => {
    await expect(inspectUpload(new File(['%PDF-1.7\nmissing end marker'], 'test.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'FILE_FORMAT' });
  });
  it('rejects an oversized PNG canvas before decoding', async () => {
    const image = bytes(png); image.writeUInt32BE(10000, 16); image.writeUInt32BE(10000, 20);
    await expect(inspectUpload(new File([image], 'test.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS' });
  });
  it('rejects an oversized JPEG canvas before decoding', async () => {
    const image = bytes(jpeg), sof = image.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sof).toBeGreaterThan(0); image.writeUInt16BE(10000, sof + 5); image.writeUInt16BE(10000, sof + 7);
    await expect(inspectUpload(new File([image], 'test.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS' });
  });
  it('rejects an oversized WebP canvas before decoding', async () => {
    const image = bytes(webps[0]!); image.writeUInt16LE(8192, 26); image.writeUInt16LE(8192, 28);
    await expect(inspectUpload(new File([image], 'test.webp', { type: 'image/webp' }))).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS' });
  });
  it('rejects a broken WebP chunk length', async () => {
    const image = bytes(webps[0]!); image.writeUInt32LE(100000, 16);
    await expect(inspectUpload(new File([image], 'test.webp', { type: 'image/webp' }))).rejects.toMatchObject({ code: 'FILE_FORMAT' });
  });
  it('rejects animated WebP plans', async () => {
    const image = bytes(webps[2]!); image[20] = image[20]! | 0x02;
    await expect(inspectUpload(new File([image], 'test.webp', { type: 'image/webp' }))).rejects.toMatchObject({ code: 'IMAGE_ANIMATED' });
  });
  it('enforces the byte limit before parsing a file', async () => {
    await expect(inspectUpload(new File([new Uint8Array(MAX_DOCUMENT_BYTES + 1)], 'test.png', { type: 'image/png' }))).rejects.toMatchObject({ status: 413 });
  });
  it('strips traversal, control characters and unicode-normalized separators from names', () => {
    expect(safeFilename('../../private\\Grundriss\r\n.png')).toBe('Grundriss.png');
    expect(safeFilename('／private／plan.png')).toBe('plan.png');
    expect(safeFilename('..')).toBe('Dokument');
  });
  it('bounds a body even without Content-Length', async () => {
    const request = new Request('http://localhost/upload', { method: 'POST', body: new Uint8Array(100) });
    await expect(readLimitedBytes(request, 50)).rejects.toMatchObject({ status: 413 });
  });
});
