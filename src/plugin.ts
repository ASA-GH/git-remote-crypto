import { encryptDeterministic, decryptWithMarker } from "./crypto.js";
import { CryptoPluginOptions, GitObject, SecureBinaryData, TreeEntry } from "./types.js";
import { parseTree, serializeTree, parseCommit, serializeCommit } from "./parsers.js";
import { decodeSecureText, encodeSecureText, toSBD } from "./utils.js";

/**
 * Validates whether the given binary data starts with the standard cryptographic signature marker.
 *
 * @param data - The secure binary payload to inspect.
 * @returns True if the payload matches the "ENC\x01" header sequence.
 */
function hasMarker(data: SecureBinaryData): boolean {
  return data.length >= 4 &&
    data[0] === 0x45 && data[1] === 0x4E && data[2] === 0x43 && data[3] === 0x01;
}

/**
 * Encodes a binary raw ciphertext buffer into a safe Base64URL string representation.
 * Necessary for storing raw bytes within Git tree path name fields without character corruption.
 *
 * @param buf - The raw ciphertext byte array.
 * @returns A safe Base64URL string representation.
 */
function bufferToBase64Url(buf: Uint8Array): string {
  const binary = Array.from(buf, byte => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decodes a safe Base64URL string representation back into a raw binary buffer.
 *
 * @param b64url - The Base64URL string representation.
 * @returns The extracted raw binary byte array.
 */
function base64UrlToBuffer(b64url: string): Uint8Array {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Instantiates an object transformer implementing custom encryption and decryption routines.
 * It systematically processes object contents based on object specifications (blob, tree, or commit).
 *
 * @param options - Configuration choices containing the initialized cryptographic keys.
 * @returns An orchestration layer containing `encryptObject` and `decryptObject` processors.
 */
export function createCryptoTransformer(options: CryptoPluginOptions) {
  const { masterKey } = options;

  return {
    /**
     * Restores encrypted Git object payloads back into clean local assets.
     * Processes full content restoration for blobs, filename extractions for trees, and message text blocks for commits.
     *
     * @param gitObject - The raw Git structural wrapper object containing encrypted context.
     * @returns A transformed object container holding readable content layout.
     */
    decryptObject: async (gitObject: GitObject): Promise<GitObject> => {
      const { type, object } = gitObject;
      try {
        if (type === "blob") {
          if (!hasMarker(object)) return gitObject;
          const decrypted = await decryptWithMarker(object, masterKey);
          return { ...gitObject, object: decrypted };
        }

        if (type === "tree") {
          const { entries } = parseTree(object);
          const newEntries: TreeEntry[] = [];
          for (const entry of entries) {
            try {
              const encryptedNameBuf = toSBD(base64UrlToBuffer(entry.name));
              if (hasMarker(encryptedNameBuf)) {
                const decryptedNameBuf = await decryptWithMarker(encryptedNameBuf, masterKey);
                const decryptedName = decodeSecureText(decryptedNameBuf);
                newEntries.push({ ...entry, name: decryptedName });
                continue;
              }
            } catch {
              // Gracefully bypass structures that are not encrypted
            }
            newEntries.push(entry);
          }
          return { ...gitObject, object: serializeTree(newEntries) };
        }

        if (type === "commit") {
          const { headers, messageRaw } = parseCommit(object);
          if (!hasMarker(messageRaw)) return gitObject;
          const decryptedMessage = await decryptWithMarker(messageRaw, masterKey);
          return { ...gitObject, object: serializeCommit(headers, decryptedMessage) };
        }

        return gitObject;
      } catch (err) {
        return gitObject;
      }
    },

    /**
     * Obfuscates readable text context into cryptographically secure payloads before storage.
     * Completely encrypts blobs, converts tree entry file paths into individual safe Base64URL text strings, and obfuscates commit logs.
     *
     * @param gitObject - The readable Git object structural layout context.
     * @returns A transformed object wrapper holding obfuscated text structures.
     */
    encryptObject: async (gitObject: GitObject): Promise<GitObject> => {
      const { type, object } = gitObject;
      try {
        if (type === "blob") {
          if (hasMarker(object)) return gitObject;
          const encrypted = await encryptDeterministic(object, masterKey);
          return { ...gitObject, object: encrypted };
        }

        if (type === "tree") {
          const { entries } = parseTree(object);
          const newEntries: TreeEntry[] = [];
          for (const entry of entries) {
            const nameBuf = encodeSecureText(entry.name);
            if (hasMarker(nameBuf)) {
              newEntries.push(entry);
              continue;
            }
            const encryptedNameBuf = await encryptDeterministic(nameBuf, masterKey);
            const encryptedNameStr = bufferToBase64Url(encryptedNameBuf);
            newEntries.push({ ...entry, name: encryptedNameStr });
          }
          return { ...gitObject, object: serializeTree(newEntries) };
        }

        if (type === "commit") {
          const { headers, messageRaw } = parseCommit(object);
          if (hasMarker(messageRaw)) return gitObject;
          const encryptedMessage = await encryptDeterministic(messageRaw, masterKey);
          return { ...gitObject, object: serializeCommit(headers, encryptedMessage) };
        }

        return gitObject;
      } catch (err) {
        return gitObject;
      }
    }
  };
}