export {
  importMasterKey,
  encryptDeterministic,
  decryptWithMarker,
} from "./crypto.js";

export { createCryptoPlugin } from "./plugin.js";

export type {
  SecureBinaryData,
  CryptoPluginOptions,
  GitObject
} from "./types.js";

export {
  createSecureBuffer,
  encodeSecureText,
  decodeSecureText,
} from "./utils.js";
