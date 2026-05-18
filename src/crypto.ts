import { SecureBinaryData } from "./types.js";
import { createSecureBuffer, encodeSecureText } from "./utils.js";

/**
 * Imports raw bytes of the shared team key as a base HKDF secret.
 * The key is marked as non-extractable to ensure maximum security in memory.
 */
export async function importMasterKey(
  rawKey: SecureBinaryData
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
}

/**
 * Deterministically encrypts data using the AES-GCM algorithm.
 * The IV is generated based on the HMAC of the content, which preserves Git hash stability.
 */
export async function encryptDeterministic(
  plain: SecureBinaryData,
  masterKey: CryptoKey
): Promise<SecureBinaryData> {
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

  const ivFull = await crypto.subtle.sign("HMAC", hmacKey, plain);
  const iv = new Uint8Array(ivFull.slice(0, 12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plain
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

  const iv = encryptedData.subarray(4, 16) as SecureBinaryData;
  const ciphertext = encryptedData.subarray(16) as SecureBinaryData;

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