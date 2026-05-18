import { SecureBinaryData } from "./index.js";

/**
 * Reusable instance of TextEncoder for high-performance string encoding.
 */
const encoder = new TextEncoder();

/**
 * Reusable instance of TextDecoder for high-performance string decoding.
 */
const decoder = new TextDecoder();

/**
 * Creates a SecureBinaryData instance with a strictly allocated standard ArrayBuffer.
 */
export function createSecureBuffer(size: number): SecureBinaryData {
  return new Uint8Array(new ArrayBuffer(size)) as SecureBinaryData;
}

/**
 * Safely encodes a string into a SecureBinaryData structure.
 * Utilizes in-place encoding to prevent redundant memory allocations.
 */
export function encodeSecureText(text: string): SecureBinaryData {
  const byteLength = encoder.encode(text).byteLength;
  const result = createSecureBuffer(byteLength);

  encoder.encodeInto(text, result);

  return result;
}

/**
 * Safely decodes SecureBinaryData back into a string.
 */
export function decodeSecureText(buffer: SecureBinaryData): string {
  return decoder.decode(buffer);
}
