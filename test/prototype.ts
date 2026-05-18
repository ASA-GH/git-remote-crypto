import fs from "node:fs";
import path from "node:path";
import {
  importMasterKey,
  encryptDeterministic,
  decryptWithMarker,
} from "../src/index.js";

/**
 * Executable prototype script for validating the cryptographic core of the library.
 * Demonstrates an end-to-end flow of reading the key, encrypting data, and successful decryption.
 */
async function main() {
  const defaultKeyPath = path.join(process.cwd(), ".git-crypt-key");

  if (!fs.existsSync(defaultKeyPath)) {
    console.error(`[ERROR] Team key file not found at path: ${defaultKeyPath}`);
    console.error("[INFO] Create it using the command: node -e \"require('fs').writeFileSync('.git-crypt-key', crypto.randomBytes(32))\"");
    process.exit(1);
  }

  const rawKeyFile = fs.readFileSync(defaultKeyPath);
  const rawKeyArray = new Uint8Array(rawKeyFile.buffer, rawKeyFile.byteOffset, rawKeyFile.byteLength) as Uint8Array<ArrayBuffer>;

  const masterKey = await importMasterKey(rawKeyArray);
  console.log("[OK] Team key successfully loaded from .git-crypt-key");

  const originalText = "Secret source code of our team that will be pushed to GitHub encrypted!";
  console.log("[OK] Original text:", originalText);
  const plainData = new TextEncoder().encode(originalText) as Uint8Array<ArrayBuffer>;

  const encryptedData = await encryptDeterministic(plainData, masterKey);
  const marker = encryptedData.slice(0, 4);

  if (
    marker[0] === 0x45 &&
    marker[1] === 0x4E &&
    marker[2] === 0x43 &&
    marker[3] === 0x01
  ) {
    console.log("[OK] Encryption marker ENC\\x01 successfully applied!");
  } else {
    console.log("[ERROR] Marker does not match ENC\\x01");
  }

  try {
    const decryptedData = await decryptWithMarker(encryptedData as Uint8Array<ArrayBuffer>, masterKey);
    const decryptedText = new TextDecoder().decode(decryptedData);

    console.log("[OK] Decrypted text:", decryptedText);

    if (decryptedText === originalText) {
      console.log("\n[SUCCESS] Full cycle works perfectly! Data matches 100%.");
    } else {
      console.log("\n[FAIL] Data decrypted, but the text is corrupted.");
    }
  } catch (error) {
    console.error("\n[FAIL] Error during decryption:", error);
  }
}

main().catch(console.error);
