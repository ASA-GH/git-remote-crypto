import { encryptDeterministic, decryptWithMarker } from "./crypto.js";
import { CryptoPluginOptions, GitObject } from "./types.js";

/**
 * Creates a set of interceptors for isomorphic-git to enable transparent encryption.
 */
export function createCryptoPlugin(options: CryptoPluginOptions) {
  const { masterKey } = options;

  return {
    /**
     * Intercepts object reading. Decrypts data on the fly if the encryption marker is found.
     */
    readObject: async (originalRead: () => Promise<GitObject>): Promise<GitObject> => {
      const gitObject = await originalRead();

      try {
        const decryptedRaw = await decryptWithMarker(gitObject.object, masterKey);

        return {
          ...gitObject,
          object: decryptedRaw
        };
      } catch (error) {
        return gitObject;
      }
    },

    /**
     * Intercepts object writing. Deterministically encrypts data before saving it to disk.
     */
    writeObject: async (gitObject: GitObject, originalWrite: (obj: GitObject) => Promise<string>): Promise<string> => {
      const encryptedRaw = await encryptDeterministic(gitObject.object, masterKey);

      return originalWrite({
        ...gitObject,
        object: encryptedRaw
      });
    }
  };
}