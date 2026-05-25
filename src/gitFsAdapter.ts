import { createCryptoTransformer } from "./plugin.js";
import { GitObject } from "./types.js";
import { decodeSecureText, encodeSecureText, toSBD } from "./utils.js";
import pako from "pako";

/**
 * Creates a file system proxy wrapper that intercepts raw Git loose objects during read and write operations.
 * This intercepts data directly at the I/O layer, applying zero-knowledge encryption transparently
 * without requiring high-level plugin support from the isomorphic-git core.
 *
 * @param baseFs - The underlying platform-specific file system client (Node 'fs' or virtual browser FS).
 * @param masterKey - The master CryptoKey utilized for deterministic encryption and decryption.
 * @returns An intercepted file system client compatible with isomorphic-git.
 */
export function createGitCryptoFs(baseFs: any, masterKey: CryptoKey) {
  const transformer = createCryptoTransformer({ masterKey });

  /**
   * Internal helper to decompress, parse, transform, and re-compress a native Git loose object.
   */
  async function processGitObject(buffer: Uint8Array, mode: "encrypt" | "decrypt"): Promise<Uint8Array> {
    try {
      const decompressed = pako.inflate(buffer);

      const nullIdx = decompressed.indexOf(0);
      if (nullIdx === -1) return buffer;

      const header = decodeSecureText(decompressed.slice(0, nullIdx));
      const [type] = header.split(" ");
      const content = decompressed.slice(nullIdx + 1);

      if (type !== "blob" && type !== "tree" && type !== "commit") return buffer;

      const gitObject: GitObject = {
        type: type as any,
        object: toSBD(content)
      };

      const transformed = mode === "encrypt"
        ? await transformer.encryptObject(gitObject)
        : await transformer.decryptObject(gitObject);

      const newHeaderStr = `${transformed.type} ${transformed.object.length}\0`;
      const newHeaderBuf = encodeSecureText(newHeaderStr);

      const resultBuf = new Uint8Array(newHeaderBuf.length + transformed.object.length);
      resultBuf.set(newHeaderBuf);
      resultBuf.set(transformed.object, newHeaderBuf.length);

      return pako.deflate(resultBuf);
    } catch {
      return buffer;
    }
  }

  const isGitObjectPath = (path: string) =>
    path.includes(".git/objects/") && !path.includes("pack") && !path.includes("info");

  return {
    ...baseFs,

    async writeFile(path: string, data: any, options: any) {
      let finalData = data;
      if (isGitObjectPath(path) && (data instanceof Uint8Array || Buffer.isBuffer(data))) {
        finalData = await processGitObject(new Uint8Array(data), "encrypt");
      }
      const fsClient = baseFs.promises ?? baseFs;
      return fsClient.writeFile(path, finalData, options);
    },

    async readFile(path: string, options: any) {
      const fsClient = baseFs.promises ?? baseFs;
      const data = await fsClient.readFile(path, options);

      if (isGitObjectPath(path) && (data instanceof Uint8Array || Buffer.isBuffer(data))) {
        return processGitObject(new Uint8Array(data), "decrypt");
      }
      return data;
    }
  };
}
