import decode from './jpeg-decoder.js';
import encode from './jpeg-encoder.js';

/** JPEG → { width, height, data: RGBA Uint8Array } */
export function decodeJpeg(bytes) {
  return decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
}

/** RGBA Uint8Array → bytes JPEG */
export function encodeJpeg(rgba, width, height, quality) {
  return encode({ data: rgba, width, height }, quality).data;
}
