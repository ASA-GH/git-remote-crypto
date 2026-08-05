import { describe, test, expect, beforeEach } from "vitest";

import {
  createCryptoTransformer,
  importMasterKey,
  encodeSecureText,
  decodeSecureText,
  createSecureBuffer,
  serializeTree,
  serializeCommit,
  GitObject,
  TreeEntry
} from "../src/core.js";

describe("plugin architecture tests", () => {
  let masterKey: CryptoKey;
  let transformer: ReturnType<typeof createCryptoTransformer>;

  beforeEach(async () => {
    const rawKey = createSecureBuffer(32);
    rawKey.set(new Array(32).fill(7));
    masterKey = await importMasterKey(rawKey);
    transformer = createCryptoTransformer({ masterKey });
  });

  /**
   * Assures that a Git blob object goes through a complete encryption and decryption cycle successfully.
   */
  test("Should handle full cycle for blob encryption and decryption", async () => {
    const rawContent = encodeSecureText("Top secret blob file contents");
    const blobObject: GitObject = { type: "blob", object: rawContent };

    const encryptedBlob = await transformer.encryptObject(blobObject);
    expect(encryptedBlob.object).not.toStrictEqual(rawContent);
    expect(encryptedBlob.object[0]).toBe(0x45);

    const decryptedBlob = await transformer.decryptObject(encryptedBlob);
    expect(decodeSecureText(decryptedBlob.object)).toBe("Top secret blob file contents");
  });

  /**
   * Verifies that Git tree filenames are safely obfuscated into Base64URL strings and restored.
   */
  test("Should encrypt and decrypt filenames inside Git tree entries using Base64URL", async () => {
    const fakeHash = new Uint8Array(20).fill(0xCC);
    const mockEntries: TreeEntry[] = [
      { mode: "100644", type: "blob", name: "highly-confidential.txt", hash: fakeHash }
    ];

    const treeObject: GitObject = { type: "tree", object: serializeTree(mockEntries) };

    const encryptedTree = await transformer.encryptObject(treeObject);
    expect(encryptedTree.object.toString()).not.toContain("highly-confidential.txt");

    const decryptedTree = await transformer.decryptObject(encryptedTree);
    expect(decryptedTree.object).toStrictEqual(treeObject.object);
  });

  /**
   * Validates that commit payloads are split, messages are obfuscated, and structures are retained.
   */
  test("Should transparently obfuscate and restore commit message payloads while leaving headers intact", async () => {
    const headers = new Map<string, string[]>();
    headers.set("tree", ["abcdef1234567890abcdef1234567890abcdef12"]);
    headers.set("author", ["Developer <dev@crypto.org> 1600000000 +0000"]);

    const commitMsg = encodeSecureText("feat(security): apply robust zero-knowledge layers");
    const commitObject: GitObject = { type: "commit", object: serializeCommit(headers, commitMsg) };

    const encryptedCommit = await transformer.encryptObject(commitObject);
    expect(encryptedCommit.object).not.toStrictEqual(commitObject.object);

    const decryptedCommit = await transformer.decryptObject(encryptedCommit);
    expect(decryptedCommit.object).toStrictEqual(commitObject.object);
  });

  /**
   * Ensures the transformer acts as an idempotent passthrough if objects are already processed.
   */
  test("Should bypass encryption or decryption if the payload state matches the intent", async () => {
    const plainBlob: GitObject = { type: "blob", object: encodeSecureText("clean-asset") };

    const encryptedOnce = await transformer.encryptObject(plainBlob);
    const encryptedTwice = await transformer.encryptObject(encryptedOnce);

    expect(encryptedTwice.object).toStrictEqual(encryptedOnce.object);

    const decryptedOnce = await transformer.decryptObject(encryptedOnce);
    const decryptedTwice = await transformer.decryptObject(decryptedOnce);

    expect(decryptedTwice.object).toStrictEqual(decryptedOnce.object);
  });
});