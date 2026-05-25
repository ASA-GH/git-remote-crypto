import { describe, test, expect } from "vitest";
import {
  createSecureBuffer,
  encodeSecureText,
  decodeSecureText,
  toSBD
} from "../src/core.js";

describe("utils unit tests", () => {

  /**
   * Validates that createSecureBuffer allocates exactly the requested size
   * and isolates data strictly within a standard non-shared ArrayBuffer.
   */
  test("createSecureBuffer should allocate correct size and use plain ArrayBuffer", () => {
    const size = 64;
    const buffer = createSecureBuffer(size);

    expect(buffer.byteLength).toBe(size);
    expect(buffer.length).toBe(size);
    expect(buffer.buffer instanceof ArrayBuffer).toBe(true);
    buffer.forEach(byte => expect(byte).toBe(0));
  });

  /**
   * Verifies the full encoding and decoding loop preserves string data exactly
   * and enforces standard ArrayBuffer containers.
   */
  test("encodeSecureText and decodeSecureText should work in an end-to-end cycle", () => {
    const originalText = "Testing high-performance in-place encoding!";
    const secureBuffer = encodeSecureText(originalText);

    expect(secureBuffer.buffer instanceof ArrayBuffer).toBe(true);

    const decodedText = decodeSecureText(secureBuffer);
    expect(decodedText).toBe(originalText);
  });

  /**
   * Checks that the text utilities gracefully handle empty string allocations without crashes.
   */
  test("encodeSecureText should handle empty strings correctly", () => {
    const emptyText = "";
    const secureBuffer = encodeSecureText(emptyText);

    expect(secureBuffer.byteLength).toBe(0);

    const decodedText = decodeSecureText(secureBuffer);
    expect(decodedText).toBe("");
  });

  /**
   * Ensures that encoding correctly handles standard characters and byte boundaries.
   */
  test("encodeSecureText should correctly calculate byteLength for standard characters", () => {
    const text = "secureBuffer";
    const secureBuffer = encodeSecureText(text);

    expect(secureBuffer.byteLength).toBe(12);

    const decodedText = decodeSecureText(secureBuffer);
    expect(decodedText).toBe(text);
  });

  /**
   * Confirms that toSBD acts as a passthrough when the buffer is already a standard ArrayBuffer.
   */
  test("toSBD should pass through standard ArrayBuffer unmodified", () => {
    const rawUint = new Uint8Array([1, 2, 3]);
    const sbd = toSBD(rawUint);

    expect(sbd.buffer instanceof ArrayBuffer).toBe(true);
    expect(sbd).toStrictEqual(rawUint);
  });

  /**
   * Assures that toSBD detects a SharedArrayBuffer and safely copies its contents
   * into a fresh standard ArrayBuffer to comply with Web Crypto requirements.
   */
  test("toSBD should copy SharedArrayBuffer data into a plain ArrayBuffer", () => {
    if (typeof SharedArrayBuffer !== "undefined") {
      const sharedBuf = new SharedArrayBuffer(4);
      const sharedView = new Uint8Array(sharedBuf);
      sharedView.set([10, 20, 30, 40]);

      const sbd = toSBD(sharedView);

      expect(sbd.buffer instanceof ArrayBuffer).toBe(true);
      expect(sbd.buffer instanceof SharedArrayBuffer).toBe(false);
      expect(sbd).toStrictEqual(new Uint8Array([10, 20, 30, 40]));
    }
  });
});