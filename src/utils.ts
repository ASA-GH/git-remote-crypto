import { SecureBinaryData } from "./types.js";

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
 * Guarantees the allocation of an isolated ArrayBuffer to eliminate SharedArrayBuffer
 * or pooled memory conflicts within the Web Crypto API.
 *
 * @param size - The byte length of the buffer to allocate.
 * @returns A strictly typed SecureBinaryData instance.
 */
export function createSecureBuffer(size: number): SecureBinaryData {
  const buffer = new ArrayBuffer(size);
  return new Uint8Array(buffer) as SecureBinaryData;
}

/**
 * Safely encodes a string into a SecureBinaryData structure.
 * Utilizes in-place encoding to prevent redundant memory allocations.
 *
 * @param text - The input string to encode.
 * @returns The encoded payload as SecureBinaryData.
 */
export function encodeSecureText(text: string): SecureBinaryData {
  const byteLength = encoder.encode(text).byteLength;
  const result = createSecureBuffer(byteLength);

  encoder.encodeInto(text, result);

  return result;
}

/**
 * Safely decodes SecureBinaryData back into a string.
 *
 * @param buffer - The secure binary payload to decode.
 * @returns The decoded cleartext string.
 */
export function decodeSecureText(buffer: SecureBinaryData): string {
  return decoder.decode(buffer);
}

/**
 * Type validator and normalizer that ensures a Uint8Array uses a standard ArrayBuffer.
 * If the underlying buffer is a SharedArrayBuffer, it forces a safe in-memory copy
 * into a newly allocated standard ArrayBuffer to eliminate Web Crypto API validation errors.
 *
 * @param data - The raw Uint8Array buffer source to validate.
 * @returns A safe, strictly typed SecureBinaryData instance backed by a standard ArrayBuffer.
 */
export function toSBD(data: Uint8Array): SecureBinaryData {
  if (data.buffer instanceof SharedArrayBuffer) {
    const cleanBuffer = new ArrayBuffer(data.byteLength);
    const cleanView = new Uint8Array(cleanBuffer);
    cleanView.set(data);
    return cleanView as SecureBinaryData;
  }
  return data as SecureBinaryData;
}