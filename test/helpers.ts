import { SecureBinaryData, createSecureBuffer } from "../src/index.js";

/**
 * Generates a cryptographically strong pseudo-random 32-byte master key for testing.
 */
export function generateTestKey(): SecureBinaryData {
  const buffer = createSecureBuffer(32);
  crypto.getRandomValues(buffer);
  return buffer;
}