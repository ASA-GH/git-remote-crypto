import type { FsClient } from "isomorphic-git";

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
  fs?: any;
}

/**
 * Configuration profile for browser environments using a virtual file system client.
 */
export interface BrowserRepoProfile extends Omit<RepoProfile, "dir"> {
  fs: FsClient;
  dir: string;
}

/**
 * Configuration profile for secure Git operations over SSH in Node.js or Electron environments.
 */
export interface SshRepoProfile extends RepoProfile {
  /** The raw OpenSSH private key contents as a string. */
  privateKey: string;
  /** Optional passphrase if the private key is encrypted. */
  passphrase?: string;
  /** Optional custom port for the SSH connection (defaults to 22). */
  port?: number;
}

/**
 * Representation of an individual entry within a Git tree object.
 */
export interface TreeEntry {
  /** The file mode, e.g., "100644" for files or "40000" for subdirectories. */
  mode: string;
  /** The type of the object pointed to by this entry. */
  type: "blob" | "tree";
  /** The raw 20-byte SHA-1 hash of the target object. */
  hash: Uint8Array;
  /** The filename or directory name. */
  name: string;
}
