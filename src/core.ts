export {
  importMasterKey,
  encryptDeterministic,
  decryptWithMarker,
} from "./crypto.js";

export {
  createGitCryptoFs
} from "./gitFsAdapter.js";

export {
  parseBlob,
  serializeBlob,
  parseTree,
  serializeTree,
  parseCommit,
  serializeCommit
} from "./parsers.js";

export { createCryptoTransformer } from "./plugin.js";

export type {
  SecureBinaryData,
  CryptoPluginOptions,
  GitObject,
  RepoProfile,
  BrowserRepoProfile,
  TreeEntry,
} from "./types.js";

export {
  createSecureBuffer,
  encodeSecureText,
  decodeSecureText,
  toSBD,
} from "./utils.js";