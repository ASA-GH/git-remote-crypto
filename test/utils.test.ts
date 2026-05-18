import { describe, test, expect } from "vitest";
import {
  createSecureBuffer,
  encodeSecureText,
  decodeSecureText
} from "../src/index.js";

describe("git-remote-crypto utils tests", () => {

  test("createSecureBuffer should allocate correct size and use plain ArrayBuffer", () => {
    const size = 64;
    const buffer = createSecureBuffer(size);

    expect(buffer.byteLength).toBe(size);
    expect(buffer.length).toBe(size);
    expect(buffer.buffer.constructor.name).toBe("ArrayBuffer");
    expect(buffer.buffer instanceof ArrayBuffer).toBe(true);
    buffer.forEach(byte => expect(byte).toBe(0));
  });

  test("encodeSecureText and decodeSecureText should work in an end-to-end cycle", () => {
    const originalText = "Testing high-performance in-place encoding!";
    const secureBuffer = encodeSecureText(originalText);

    expect(secureBuffer.buffer instanceof ArrayBuffer).toBe(true);

    const decodedText = decodeSecureText(secureBuffer);

    expect(decodedText).toBe(originalText);
  });

  test("encodeSecureText should handle empty strings correctly", () => {
    const emptyText = "";
    const secureBuffer = encodeSecureText(emptyText);

    expect(secureBuffer.byteLength).toBe(0);

    const decodedText = decodeSecureText(secureBuffer);

    expect(decodedText).toBe("");
  });

  test("encodeSecureText should correctly calculate byteLength for multi-byte Unicode characters", () => {
    const text = "secureBuffer";
    const secureBuffer = encodeSecureText(text);

    expect(secureBuffer.byteLength).toBe(12);

    const decodedText = decodeSecureText(secureBuffer);
    expect(decodedText).toBe(text);
  });
});