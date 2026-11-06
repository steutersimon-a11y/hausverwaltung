import { ApiError } from './http';

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const ascii = (bytes: Uint8Array) => new TextDecoder('ascii').decode(bytes);
const MAX_IMAGE_PIXELS = 64_000_000;
const extensions: Record<string, string[]> = {
  'application/pdf': ['pdf'], 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'],
};

export function safeFilename(value: string): string {
  return value.normalize('NFKC').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim().slice(0, 150) || 'Dokument';
}

function jpegSize(bytes: Uint8Array): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++]!;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (sof.has(marker)) return length >= 8 ? [view.getUint16(offset + 5), view.getUint16(offset + 3)] : null;
    offset += length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): [number, number] | null {
  if (bytes.length < 25) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return null;
  const kind = ascii(bytes.subarray(12, 16));
  if (view.getUint32(16, true) + 20 > bytes.length) return null;
  if (kind === 'VP8X' && bytes.length >= 30) {
    if (bytes[20]! & 0x02) throw new ApiError('IMAGE_ANIMATED', 422, 'Bitte einen statischen Grundriss statt eines animierten WebP auswählen.');
    const uint24 = (at: number) => bytes[at]! | bytes[at + 1]! << 8 | bytes[at + 2]! << 16;
    return [uint24(24) + 1, uint24(27) + 1];
  }
  if (kind === 'VP8L' && bytes[20] === 0x2f && bytes[24]! >> 5 === 0) {
    return [(bytes[21]! | (bytes[22]! & 0x3f) << 8) + 1, ((bytes[22]! >> 6) | bytes[23]! << 2 | (bytes[24]! & 0x0f) << 10) + 1];
  }
  if (kind === 'VP8 ' && bytes.length >= 30 && !(bytes[20]! & 1) && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
  }
  return null;
}

function requireImageSize(size: [number, number] | null): void {
  if (!size) throw new ApiError('FILE_FORMAT', 422, 'Die Bilddatei hat keinen gültigen Größenheader.');
  const [width, height] = size;
  if (!width || !height || width > 32_768 || height > 32_768 || width * height > MAX_IMAGE_PIXELS) throw new ApiError('IMAGE_DIMENSIONS', 422, 'Das Bild ist zu groß oder ungültig (höchstens 64 Megapixel).');
}

/** Bounded header validation, not a malware scanner or a full image/PDF decoder. */
export async function inspectUpload(file: File): Promise<{ bytes: Uint8Array; mimeType: string; originalName: string }> {
  if (file.size < 8 || file.size > MAX_DOCUMENT_BYTES) throw new ApiError('FILE_SIZE', 413, 'Bitte eine nicht leere Datei mit höchstens 15 MB auswählen.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let mimeType: string | undefined;
  if (ascii(bytes.subarray(0, 5)) === '%PDF-') {
    if (!ascii(bytes.subarray(Math.max(0, bytes.length - 2048))).includes('%%EOF')) throw new ApiError('FILE_FORMAT', 422, 'Das PDF ist unvollständig.');
    mimeType = 'application/pdf';
  } else if (bytes.subarray(0, 8).every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    if (bytes.length < 45 || ascii(bytes.subarray(12, 16)) !== 'IHDR') throw new ApiError('FILE_FORMAT', 422, 'Das PNG ist unvollständig.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    requireImageSize([view.getUint32(16), view.getUint32(20)]);
    mimeType = 'image/png';
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    requireImageSize(jpegSize(bytes));
    mimeType = 'image/jpeg';
  } else if (ascii(bytes.subarray(0, 4)) === 'RIFF' && ascii(bytes.subarray(8, 12)) === 'WEBP') {
    requireImageSize(webpSize(bytes));
    mimeType = 'image/webp';
  }
  if (!mimeType) throw new ApiError('FILE_FORMAT', 415, 'Erlaubt sind PDF, PNG, JPEG und WebP. Dateiinhalte und Endung müssen übereinstimmen.');
  const originalName = safeFilename(file.name);
  const extension = originalName.split('.').at(-1)?.toLowerCase() ?? '';
  if (!extensions[mimeType]?.includes(extension)) throw new ApiError('FILE_EXTENSION', 422, 'Dateiendung und Dateiinhalte stimmen nicht überein.');
  if (file.type && file.type !== 'application/octet-stream' && file.type !== mimeType) throw new ApiError('FILE_TYPE', 422, 'Der gemeldete Dateityp stimmt nicht mit dem Inhalt überein.');
  return { bytes, mimeType, originalName };
}
