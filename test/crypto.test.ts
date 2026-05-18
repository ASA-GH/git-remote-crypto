import { describe, test, expect } from "vitest";
import {
  importMasterKey,
  encryptDeterministic,
  decryptWithMarker,
  decodeSecureText,
  encodeSecureText,
  createSecureBuffer,
  SecureBinaryData
} from "../src/index.js";

function generateRawKey(): SecureBinaryData {
  const view = createSecureBuffer(32);
  crypto.getRandomValues(view);
  return view;
}

describe("git-remote-crypto tests (Vitest)", () => {

  test("Successful encryption and decryption cycle", async () => {
    const rawKey = generateRawKey();
    const masterKey = await importMasterKey(rawKey);

    const originalText = "Hello, Git-remote-crypto securely stored data!";
    const plainData = encodeSecureText(originalText);

    const encrypted = await encryptDeterministic(plainData, masterKey);

    expect(encrypted[0]).toBe(0x45);
    expect(encrypted[1]).toBe(0x4E);
    expect(encrypted[2]).toBe(0x43);
    expect(encrypted[3]).toBe(0x01);

    const decrypted = await decryptWithMarker(encrypted, masterKey);
    const decryptedText = decodeSecureText(decrypted);

    expect(decryptedText).toBe(originalText);
  });

  test("Determinism: identical data yields identical ciphertext", async () => {
    const rawKey = generateRawKey();
    const masterKey = await importMasterKey(rawKey);
    const plainData = encodeSecureText("Deterministic content stability test");

    const encrypted1 = await encryptDeterministic(plainData, masterKey);
    const encrypted2 = await encryptDeterministic(plainData, masterKey);

    expect(encrypted1).toEqual(encrypted2);
  });

  test("Different data on the same key yields different ciphertext", async () => {
    const rawKey = generateRawKey();
    const masterKey = await importMasterKey(rawKey);

    const data1 = encodeSecureText("Message number one");
    const data2 = encodeSecureText("Message number two");

    const encrypted1 = await encryptDeterministic(data1, masterKey);
    const encrypted2 = await encryptDeterministic(data2, masterKey);

    expect(encrypted1).not.toEqual(encrypted2);
  });

  test("Error when attempting to decrypt data with an invalid marker", async () => {
    const rawKey = generateRawKey();
    const masterKey = await importMasterKey(rawKey);

    const brokenData = createSecureBuffer(8);
    brokenData.set([0x00, 0x00, 0x00, 0x00, 1, 2, 3, 4]);

    await expect(decryptWithMarker(brokenData, masterKey))
      .rejects
      .toThrow("[ERROR] Data is not encrypted with git-remote-crypto");
  });

  test("Decryption error when using a different master key", async () => {
    const rawKey1 = generateRawKey();
    const rawKey2 = generateRawKey();

    const masterKey1 = await importMasterKey(rawKey1);
    const masterKey2 = await importMasterKey(rawKey2);

    const plainData = encodeSecureText("Top secret team info");
    const encrypted = await encryptDeterministic(plainData, masterKey1);

    await expect(decryptWithMarker(encrypted, masterKey2)).rejects.toThrow();
  });
});