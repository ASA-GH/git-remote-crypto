import { describe, test, expect } from "vitest";
import { TreeEntry } from "./types.js";
import {
  parseBlob,
  serializeBlob,
  parseTree,
  serializeTree,
  parseCommit,
  serializeCommit,
  encodeSecureText,
  decodeSecureText,
  createSecureBuffer,
} from "../src/core.js";

describe("parsers unit tests", () => {

  describe("Blob Parsing and Serialization", () => {
    /**
     * Assures that blob parsers return the original payload identically.
     */
    test("Should pass through data without modifications", () => {
      const rawData = encodeSecureText("git blob content test");

      const parsed = parseBlob(rawData);
      expect(parsed).toStrictEqual(rawData);

      const serialized = serializeBlob(parsed);
      expect(serialized).toStrictEqual(rawData);
    });
  });

  describe("Tree Parsing and Serialization", () => {
    const fakeHashBlob = new Uint8Array(20).fill(0xAA);
    const fakeHashTree = new Uint8Array(20).fill(0xBB);

    const mockEntries: TreeEntry[] = [
      { mode: "100644", type: "blob", name: "README.md", hash: fakeHashBlob },
      { mode: "40000", type: "tree", name: "src", hash: fakeHashTree },
    ];

    /**
     * Verifies successful serialization and parsing match exactly for tree entries.
     */
    test("Should correctly serialize and parse back a Git tree", () => {
      const serialized = serializeTree(mockEntries);
      const { entries } = parseTree(serialized);

      expect(entries).toHaveLength(2);

      expect(entries[0].mode).toBe("100644");
      expect(entries[0].type).toBe("blob");
      expect(entries[0].name).toBe("README.md");
      expect(entries[0].hash).toStrictEqual(fakeHashBlob);

      expect(entries[1].mode).toBe("40000");
      expect(entries[1].type).toBe("tree");
      expect(entries[1].name).toBe("src");
      expect(entries[1].hash).toStrictEqual(fakeHashTree);
    });

    /**
     * Validates error handling when a tree object cuts off unexpectedly inside a 20-byte hash.
     */
    test("Should throw error if tree binary ends abruptly inside a SHA-1 hash", () => {
      const modeAndName = encodeSecureText("100644 a\0");
      const brokenTree = createSecureBuffer(modeAndName.length + 5);
      brokenTree.set(modeAndName);
      brokenTree.set([1, 2, 3, 4, 5], modeAndName.length);

      expect(() => parseTree(brokenTree))
        .toThrow("Malformed tree object: unexpected EOF inside SHA-1 hash");
    });
  });

  describe("Commit Parsing and Serialization", () => {
    /**
     * Assures headers (including multi-line) and commit message are processed correctly.
     */
    test("Should parse and serialize standard commit layout with headers", () => {
      const headers = new Map<string, string[]>();
      headers.set("tree", ["1234567890abcdef1234567890abcdef12345674"]);
      headers.set("author", ["Dev <dev@test.com> 1234567890 +0000"]);
      headers.set("gpgsig", ["-----BEGIN PGP SIGNATURE-----\n Version: 1.0\n -----END PGP SIGNATURE-----"]);

      const rawMessage = encodeSecureText("feat(core): implementation message\n\nCloses #1");

      const serialized = serializeCommit(headers, rawMessage);
      const { headers: parsedHeaders, messageRaw: parsedMessage } = parseCommit(serialized);

      expect(decodeSecureText(parsedMessage)).toBe("feat(core): implementation message\n\nCloses #1");
      expect(parsedHeaders.get("tree")?.[0]).toBe("1234567890abcdef1234567890abcdef12345674");
      expect(parsedHeaders.get("author")?.[0]).toBe("Dev <dev@test.com> 1234567890 +0000");
      expect(parsedHeaders.get("gpgsig")?.[0]).toBe("-----BEGIN PGP SIGNATURE-----\n Version: 1.0\n -----END PGP SIGNATURE-----");
    });

    /**
     * Confirms parsing failure when header and body sections are not split by double newline (\n\n).
     */
    test("Should throw error if double newline separator is missing in commit payload", () => {
      const invalidCommit = encodeSecureText("tree abc123hash\nauthor Tester <test@test.com>\nJust message without separator");

      expect(() => parseCommit(invalidCommit))
        .toThrow("Invalid commit object: header/message separator not found");
    });
  });
});