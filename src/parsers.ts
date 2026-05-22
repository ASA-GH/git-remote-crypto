import { SecureBinaryData, TreeEntry } from "./types.js";
import { createSecureBuffer, encodeSecureText, decodeSecureText, toSBD } from "./utils.js";

/**
 * Parses a blob object. Returns the original buffer unmodified.
 *
 * @param data - The raw blob data.
 * @returns The same secure binary payload.
 */
export function parseBlob(data: SecureBinaryData): SecureBinaryData {
  return data;
}

/**
 * Serializes a blob object from a buffer.
 *
 * @param content - The clean secure binary content.
 * @returns The serialized secure binary buffer.
 */
export function serializeBlob(content: SecureBinaryData): SecureBinaryData {
  return content;
}

/**
 * Parses a Git tree object into a list of structured entries.
 * Note: isomorphic-git passes the raw body data without the "tree [size]\0" prefix.
 *
 * @param data - The raw tree body buffer payload.
 * @returns An object containing the parsed tree entries array.
 * @throws {Error} If the tree structure ends abruptly within a SHA-1 hash segment.
 */
export function parseTree(data: SecureBinaryData): { entries: TreeEntry[] } {
  const entries: TreeEntry[] = [];
  let pos = 0;

  while (pos < data.length) {
    let modeEnd = pos;
    while (modeEnd < data.length && data[modeEnd] !== 0x20) modeEnd++;
    if (modeEnd === data.length) break;

    const modeBuf = new Uint8Array(data.buffer, data.byteOffset + pos, modeEnd - pos);
    const mode = decodeSecureText(toSBD(modeBuf));
    pos = modeEnd + 1;

    let nameEnd = pos;
    while (nameEnd < data.length && data[nameEnd] !== 0) nameEnd++;
    if (nameEnd === data.length) break;

    const nameBuf = new Uint8Array(data.buffer, data.byteOffset + pos, nameEnd - pos);
    const name = decodeSecureText(toSBD(nameBuf));
    pos = nameEnd + 1;

    if (pos + 20 > data.length) {
      throw new Error('Malformed tree object: unexpected EOF inside SHA-1 hash');
    }
    const hash = new Uint8Array(data.buffer, data.byteOffset + pos, 20).slice();
    pos += 20;

    const type: 'blob' | 'tree' = mode === '40000' ? 'tree' : 'blob';

    entries.push({ mode, type, hash, name });
  }

  return { entries };
}

/**
 * Serializes an array of tree entries back into the standard Git binary tree format.
 * Structure per entry: [mode][space][name][null][20-byte raw SHA-1 hash].
 *
 * @param entries - The list of target tree entries to encode.
 * @returns The serialized secure binary data payload.
 */
export function serializeTree(entries: TreeEntry[]): SecureBinaryData {
  const bodyParts: Uint8Array[] = [];
  let bodyLength = 0;

  for (const e of entries) {
    const modeBuf = encodeSecureText(e.mode);
    const space = new Uint8Array([0x20]);
    const nameBuf = encodeSecureText(e.name);
    const nullByte = new Uint8Array([0x00]);

    bodyParts.push(modeBuf, space, nameBuf, nullByte, e.hash);
    bodyLength += modeBuf.length + 1 + nameBuf.length + 1 + 20;
  }

  const result = createSecureBuffer(bodyLength);
  let offset = 0;
  for (const part of bodyParts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Parses a Git commit object, isolating headers from the core text message payload.
 *
 * @param data - The raw commit object payload buffer.
 * @returns A structured mapping of headers and an isolated secure text message buffer.
 * @throws {Error} If the standard double-newline sequence separating headers and message is missing.
 */
export function parseCommit(data: SecureBinaryData): {
  headers: Map<string, string[]>;
  messageRaw: SecureBinaryData;
} {
  let doubleNewlinePos = -1;

  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0x0A && data[i+1] === 0x0A) {
      doubleNewlinePos = i;
      break;
    }
  }

  if (doubleNewlinePos === -1) throw new Error('Invalid commit object: header/message separator not found');

  const headerBuf = new Uint8Array(data.buffer, data.byteOffset, doubleNewlinePos);
  const headerSection = decodeSecureText(toSBD(headerBuf));

  const headers = new Map<string, string[]>();
  const lines = headerSection.split('\n');

  let currentKey = '';

  for (const line of lines) {
    if (line.startsWith(' ')) {
      if (currentKey) {
        const list = headers.get(currentKey)!;
        list[list.length - 1] += '\n' + line;
      }
    } else {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx > 0) {
        currentKey = line.slice(0, spaceIdx);
        const value = line.slice(spaceIdx + 1);
        if (!headers.has(currentKey)) {
          headers.set(currentKey, []);
        }
        headers.get(currentKey)!.push(value);
      }
    }
  }

  const messageStart = doubleNewlinePos + 2;
  const messageLen = data.length - messageStart;
  const messageRaw = createSecureBuffer(messageLen);
  messageRaw.set(new Uint8Array(data.buffer, data.byteOffset + messageStart, messageLen));

  return { headers, messageRaw };
}

/**
 * Assembles a valid Git commit object payload from structured headers and a raw message buffer.
 *
 * @param headers - A multi-value map containing the commit headers.
 * @param messageRaw - The secure binary message payload (could be encrypted).
 * @returns The serialized commit secure binary payload.
 */
export function serializeCommit(headers: Map<string, string[]>, messageRaw: SecureBinaryData): SecureBinaryData {
  let headerText = '';

  for (const [key, values] of headers) {
    for (const val of values) {
      const lines = val.split('\n');
      headerText += `${key} ${lines[0]}\n`;
      for (let i = 1; i < lines.length; i++) {
        headerText += `${lines[i]}\n`;
      }
    }
  }
  headerText += '\n';

  const headerBuf = encodeSecureText(headerText);
  const result = createSecureBuffer(headerBuf.length + messageRaw.length);

  result.set(headerBuf);
  result.set(messageRaw, headerBuf.length);

  return result;
}