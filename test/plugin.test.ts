import { describe, test, expect } from "vitest";
import { generateTestKey } from "./helpers.js";
import {
  importMasterKey,
  createCryptoPlugin,
  GitObject,
  encodeSecureText,
  decodeSecureText,
  createSecureBuffer
} from "../src/index.js";

describe("git-remote-crypto plugin tests", () => {

  test("writeObject should transparently encrypt the object buffer", async () => {
    const rawKey = generateTestKey();
    const masterKey = await importMasterKey(rawKey);
    const plugin = createCryptoPlugin({ masterKey });

    const originalContent = encodeSecureText("Top secret commit data");
    const gitObject: GitObject = {
      type: "blob",
      object: originalContent
    };

    const originalWriteMock = async (obj: GitObject): Promise<string> => {
      expect(obj.object[0]).toBe(0x45);
      expect(obj.object[1]).toBe(0x4E);
      expect(obj.object[2]).toBe(0x43);
      expect(obj.object[3]).toBe(0x01);

      expect(obj.object.byteLength).toBeGreaterThan(originalContent.byteLength);

      return "mock-oid-12345";
    };

    const resultOid = await plugin.writeObject(gitObject, originalWriteMock);
    expect(resultOid).toBe("mock-oid-12345");
  });

  test("readObject should transparently decrypt encrypted objects on the fly", async () => {
    const rawKey = generateTestKey();
    const masterKey = await importMasterKey(rawKey);
    const plugin = createCryptoPlugin({ masterKey });

    const secretString = "Transparently decrypted Git history log";
    const plainContent = encodeSecureText(secretString);

    let encryptedBuffer = createSecureBuffer(0);
    const saveEncryptedBuffer = async (obj: GitObject) => {
      encryptedBuffer = obj.object;
      return "mock-oid";
    };

    await plugin.writeObject({ type: "blob", object: plainContent }, saveEncryptedBuffer);

    const originalReadMock = async (): Promise<GitObject> => {
      return {
        type: "blob",
        object: encryptedBuffer
      };
    };

    const decryptedObject = await plugin.readObject(originalReadMock);
    const decryptedString = decodeSecureText(decryptedObject.object);

    expect(decryptedString).toBe(secretString);
    expect(decryptedObject.type).toBe("blob");
  });

  test("readObject should return unencrypted data as-is if the marker is missing", async () => {
    const rawKey = generateTestKey();
    const masterKey = await importMasterKey(rawKey);
    const plugin = createCryptoPlugin({ masterKey });

    const unencryptedText = "Regular cleartext Git object from local environment";
    const plainContent = encodeSecureText(unencryptedText);

    const originalReadMock = async (): Promise<GitObject> => {
      return {
        type: "blob",
        object: plainContent
      };
    };

    const resultObject = await plugin.readObject(originalReadMock);
    const resultString = decodeSecureText(resultObject.object);

    expect(resultString).toBe(unencryptedText);
  });
});
