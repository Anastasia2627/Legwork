/**
 * Minimal WebP container validation for browser-reencoded public artwork.
 * Cloudflare Workers Free cannot rely on the paid Images transformation binding.
 * Reject metadata (EXIF/XMP/ICCP), animation, and unknown RIFF chunks.
 */
const ASCII = (bytes, from, size) => String.fromCharCode(...bytes.subarray(from, from + size));
const read32 = (view, offset) => view.getUint32(offset, true);

export function isSafeWebp(input, maxBytes = 2 * 1024 * 1024) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 30 || bytes.byteLength > maxBytes) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ASCII(bytes, 0, 4) !== 'RIFF' || ASCII(bytes, 8, 4) !== 'WEBP') return false;
  if (read32(view, 4) !== bytes.length - 8) return false;

  let position = 12, seenImage = false, extended = false, alpha = false;
  let chunkIndex = 0;
  while (position < bytes.length) {
    if (position + 8 > bytes.length) return false;
    const type = ASCII(bytes, position, 4);
    const length = read32(view, position + 4);
    const chunkStart = position + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd > bytes.length || chunkEnd + (length & 1) > bytes.length) return false;
    if (chunkIndex === 0 && type === 'VP8X') {
      if (length !== 10) return false;
      extended = true;
      const flags = bytes[chunkStart];
      if (flags & 0x2e) return false; // animation, ICCP, EXIF, XMP
      const width = 1 + bytes[chunkStart + 4] + (bytes[chunkStart + 5] << 8) + (bytes[chunkStart + 6] << 16);
      const height = 1 + bytes[chunkStart + 7] + (bytes[chunkStart + 8] << 8) + (bytes[chunkStart + 9] << 16);
      if (width > 2200 || height > 2200) return false;
    } else if (type === 'ALPH' && extended && !seenImage && !alpha) {
      if (!length) return false;
      alpha = true;
    } else if ((type === 'VP8 ' || type === 'VP8L') && !seenImage) {
      if (type === 'VP8 ' && (length < 10 || bytes[chunkStart + 3] !== 0x9d ||
          bytes[chunkStart + 4] !== 0x01 || bytes[chunkStart + 5] !== 0x2a)) return false;
      if (type === 'VP8L' && (length < 5 || bytes[chunkStart] !== 0x2f || alpha)) return false;
      seenImage = true;
    } else return false;
    position = chunkEnd + (length & 1);
    chunkIndex++;
    if (chunkIndex > 4) return false;
  }
  return seenImage && position === bytes.length;
}
