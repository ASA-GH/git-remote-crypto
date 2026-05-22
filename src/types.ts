import type { FsClient } from 'isomorphic-git';

/**
 * Strict binary array ensuring the use of a standard ArrayBuffer.
 * Eliminates the risks of using SharedArrayBuffer with the Web Crypto API.
 */
export type SecureBinaryData = Uint8Array & { buffer: ArrayBuffer };

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

/**
 * Configuration profile for an individual Git repository in Node.js or Electron environments.
 */
export interface RepoProfile {
  name: string;
  key: CryptoKey;
  url: string;
  dir: string;
  remote?: string;
  ref?: string;
}

/**
 * Configuration profile for browser environments using a virtual file system client.
 */
export interface BrowserRepoProfile extends Omit<RepoProfile, 'dir'> {
  fs: FsClient;
  dir: string;
}