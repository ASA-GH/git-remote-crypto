import { SecureBinaryData } from "./types.js";
import { createSecureBuffer, encodeSecureText } from "./utils.js";

/**
 * Imports raw bytes of the shared team key as a base HKDF secret.
 * The key is marked as non-extractable to ensure maximum security in memory.
 *
 * @param rawKey - The shared secret key bytes.
 * @returns A promise that resolves to the derived CryptoKey.
 */
export async function importMasterKey(
  rawKey: SecureBinaryData
): Promise<CryptoKey> {
  const cleanView = new Uint8Array(rawKey.buffer, rawKey.byteOffset, rawKey.byteLength);

  return crypto.subtle.importKey(
    "raw",
    cleanView,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
}

/**
 * Deterministically encrypts data using the AES-GCM algorithm.
 * The IV is generated based on the HMAC of the content, which preserves Git hash stability.
 *
 * @param plain - The cleartext payload to be encrypted.
 * @param masterKey - The master CryptoKey used for derivation.
 * @returns A promise that resolves to the encrypted payload with a prepended signature marker and IV.
 */
export async function encryptDeterministic(
  plain: SecureBinaryData,
  masterKey: CryptoKey
): Promise<SecureBinaryData> {
  const plainView = new Uint8Array(plain.buffer, plain.byteOffset, plain.byteLength);

  const hmacKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encodeSecureText("git-remote-crypto:hmac")
    },
    masterKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encodeSecureText("git-remote-crypto:aes")
    },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ivFull = await crypto.subtle.sign("HMAC", hmacKey, plainView);
  const iv = new Uint8Array(ivFull.slice(0, 12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plainView
  );

  const ciphertext = new Uint8Array(encrypted);
  const marker = new Uint8Array([0x45, 0x4E, 0x43, 0x01]);

  const result = createSecureBuffer(marker.length + iv.length + ciphertext.length);

  result.set(marker);
  result.set(iv, marker.length);
  result.set(ciphertext, marker.length + iv.length);

  return result;
}

/**
 * Decrypts data using AES-GCM, previously verifying the marker signature.
 * Extracts the initialization vector and strips the marker before decrypting the content.
 *
 * @param encryptedData - The encrypted payload containing the marker and IV.
 * @param masterKey - The master CryptoKey used for derivation.
 * @returns A promise that resolves to the decrypted clean text payload.
 * @throws {Error} If the data does not start with the valid cryptographic marker.
 */
export async function decryptWithMarker(
  encryptedData: SecureBinaryData,
  masterKey: CryptoKey
): Promise<SecureBinaryData> {
  if (
    encryptedData[0] !== 0x45 ||
    encryptedData[1] !== 0x4E ||
    encryptedData[2] !== 0x43 ||
    encryptedData[3] !== 0x01
  ) {
    throw new Error("[ERROR] Data is not encrypted with git-remote-crypto");
  }

  const iv = new Uint8Array(encryptedData.buffer, encryptedData.byteOffset + 4, 12);
  const ciphertext = new Uint8Array(encryptedData.buffer, encryptedData.byteOffset + 16, encryptedData.byteLength - 16);

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encodeSecureText("git-remote-crypto:aes")
    },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );

  const result = createSecureBuffer(decrypted.byteLength);
  result.set(new Uint8Array(decrypted));

  return result;
}