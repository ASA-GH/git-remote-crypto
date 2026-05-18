/**
 * Strict binary array ensuring the use of a standard ArrayBuffer.
 * Eliminates the risks of using SharedArrayBuffer with the Web Crypto API.
 */
export type SecureBinaryData = Uint8Array<ArrayBuffer>;

/**
 * Configuration options required to initialize the cryptographic plugin.
 */
export interface CryptoPluginOptions {
  /** The non-extractable master CryptoKey used for HKDF derivation. */
  masterKey: CryptoKey;
}

/**
 * Low-level Git object representation used by isomorphic-git.
 */
export interface GitObject {
  oid?: string;
  type: "blob" | "commit" | "tree" | "tag";
  object: SecureBinaryData;
}