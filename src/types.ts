/**
 * Strict binary array ensuring the use of a standard ArrayBuffer.
 * Eliminates the risks of using SharedArrayBuffer with the Web Crypto API.
 */
export type SecureBinaryData = Uint8Array<ArrayBuffer>;