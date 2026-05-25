import { describe, test, expect, vi, beforeEach } from "vitest";
import pako from "pako";
import {
  importMasterKey,
  encodeSecureText,
  decodeSecureText,
  createSecureBuffer,
  createGitCryptoFs
} from "../src/core.js";

vi.mock("./plugin.js", () => ({
  createCryptoTransformer: () => ({
    encryptObject: async (obj: any) => ({
      type: obj.type,
      object: encodeSecureText("ENCRYPTED_" + decodeSecureText(obj.object))
    }),
    decryptObject: async (obj: any) => ({
      type: obj.type,
      object: encodeSecureText(decodeSecureText(obj.object).replace("ENCRYPTED_", ""))
    })
  })
}));

describe("gitFsAdapter tests", () => {
  let masterKey: CryptoKey;
  let mockFs: any;
  const gitObjectPath = ".git/objects/1f/23456789abcdef";
  const regularFilePath = "src/index.ts";

  /**
   * Helper to create a valid zlib-compressed Git loose object representation.
   */
  function createRawGitBlob(contentStr: string): Uint8Array {
    const content = encodeSecureText(contentStr);
    const header = encodeSecureText(`blob ${content.length}\0`);
    const fullObject = new Uint8Array(header.length + content.length);
    fullObject.set(header);
    fullObject.set(content, header.length);
    return pako.deflate(fullObject);
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const rawKey = createSecureBuffer(32);
    rawKey.set(new Array(32).fill(1));
    masterKey = await importMasterKey(rawKey);

    mockFs = {
      files: {} as Record<string, Uint8Array>,
      async writeFile(path: string, data: Uint8Array) {
        this.files[path] = data;
      },
      async readFile(path: string) {
        if (!this.files[path]) throw new Error("File not found");
        return this.files[path];
      }
    };
  });

  /**
   * Verifies that writing to a specific Git object path transparently encrypts the contents.
   */
  test("Transparently encrypts loose Git objects on writeFile", async () => {
    const cryptoFs = createGitCryptoFs(mockFs, masterKey);
    const originalBlob = createRawGitBlob("secret-source-code");

    await cryptoFs.writeFile(gitObjectPath, originalBlob);

    const storedData = mockFs.files[gitObjectPath];
    const decompressed = pako.inflate(storedData);
    const nullIdx = decompressed.indexOf(0);
    const content = decodeSecureText(decompressed.slice(nullIdx + 1));

    expect(content).toBe("ENCRYPTED_secret-source-code");
  });

  /**
   * Confirms that reading from a Git object path transparently decrypts the stored payload.
   */
  test("Transparently decrypts loose Git objects on readFile", async () => {
    const cryptoFs = createGitCryptoFs(mockFs, masterKey);
    const encryptedBlob = createRawGitBlob("ENCRYPTED_my-git-data");

    mockFs.files[gitObjectPath] = encryptedBlob;

    const result = await cryptoFs.readFile(gitObjectPath);
    const decompressed = pako.inflate(result);
    const nullIdx = decompressed.indexOf(0);
    const content = decodeSecureText(decompressed.slice(nullIdx + 1));

    expect(content).toBe("my-git-data");
  });

  /**
   * Ensures that standard source files or config paths completely bypass the encryption layer.
   */
  test("Bypasses encryption for non-git object paths", async () => {
    const cryptoFs = createGitCryptoFs(mockFs, masterKey);
    const regularContent = encodeSecureText("console.log('hello')");

    await cryptoFs.writeFile(regularFilePath, regularContent);

    // Данные должны сохраниться один к одному без сжатия pako и шифрования
    expect(mockFs.files[regularFilePath]).toStrictEqual(regularContent);

    const readResult = await cryptoFs.readFile(regularFilePath);
    expect(readResult).toStrictEqual(regularContent);
  });

  /**
   * Assures that if decompression or processing fails, the adapter gracefully falls back to raw data.
   */
  test("Gracefully falls back to raw buffer if data parsing fails", async () => {
    const cryptoFs = createGitCryptoFs(mockFs, masterKey);
    const invalidData = encodeSecureText("completely-broken-non-zlib-packet");

    await cryptoFs.writeFile(gitObjectPath, invalidData);

    expect(mockFs.files[gitObjectPath]).toStrictEqual(invalidData);
  });
});