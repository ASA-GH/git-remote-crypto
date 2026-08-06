# User Scenarios

## Prerequisites — Key Initialization

Before any Git operation, the user must obtain a master key and import it.

```typescript
import { importMasterKey } from "git-remote-crypto";

const rawKeyBytes = new Uint8Array(32); // 32 secret bytes (e.g., from KDF, keychain, or secure storage)
crypto.getRandomValues(rawKeyBytes);
const masterKey = await importMasterKey(rawKeyBytes);
```

The `importMasterKey` function wraps raw bytes in a non-extractable `CryptoKey` usable for HKDF derivation. The key must be 32 bytes for AES-256.

---

## Scenario: Initialize Encrypted Repository (Node.js / HTTPS)

**Goal:** Create a new local Git repository with transparent encryption for pushes.

1. Import `createCryptoGitContext` from `git-remote-crypto`.
2. Create context (zero-config): `const manager = createCryptoGitContext()`.
3. Add profile: `{ name, url, dir, ref, key: masterKey }`.
4. Call `manager.init(name)` — creates `.git`, writes `core.encrypted = true`.
5. Subsequent `add`/`commit`/`push` operations automatically encrypt objects on write and decrypt on read.

**Expected outcome:** Pushed objects are encrypted; remote server stores ciphertext. Clone from another instance with the same key produces decrypted local files.

**Files involved:** `src/index.ts` (`createCryptoGitContext`, `CryptoGitManager`), `src/gitFsAdapter.ts` (`createGitCryptoFs`), `src/plugin.ts` (`createCryptoTransformer`).

---

## Scenario: Clone Encrypted Repository (Node.js / HTTPS)

**Goal:** Clone an existing encrypted repository.

1. Add profile with same `masterKey` as the original.
2. Call `manager.clone(name, { url, dir, ref? })`.
3. isomorphic-git fetches encrypted objects via HTTPS.
4. `createGitCryptoFs.writeFile` intercepts each object, runs `decryptObject`, re-compresses, writes to disk.
5. Local working tree contains decrypted content.

**Expected outcome:** Full repository cloned with plaintext files locally, encrypted data on remote.

**Edge case — wrong key:** Decryption fails silently (errors are caught in `plugin.ts`). The local objects remain encrypted on disk, producing garbled content in the working tree.

---

## Scenario: Push Changes (HTTPS)

**Goal:** Push local changes to remote.

1. Stage files: `manager.add(name, ["file1.txt", "file2.txt"])`.
2. Commit: `const sha = await manager.commit(name, "message", { name, email })`.
3. Push: `manager.push(name)`.

During push, `createGitCryptoFs.readFile` intercepts each object, runs `encryptObject`, re-compresses, and sends to remote.

**Expected outcome:** Remote receives encrypted objects; tree hashes reflect encrypted content.

---

## Scenario: Pull Changes (HTTPS)

**Goal:** Fetch and integrate remote changes.

1. Call `manager.pull(name)`.
2. isomorphic-git fetches remote objects via HTTPS.
3. `createGitCryptoFs.readFile` intercepts each object, runs `decryptObject`, decompresses, writes decrypted content to disk.
4. Git merge logic operates on decrypted content.

**Expected outcome:** Local working tree reflects remote state with plaintext files.

**Edge case — merge conflict:** Handled by isomorphic-git on decrypted content. The user resolves conflicts in plaintext; the resolution is encrypted on the next commit/push.

---

## Scenario: Initialize Encrypted Repository (SSH Transport)

**Goal:** Use SSH instead of HTTPS for network operations.

1. Import `createCryptoGitContext` from `git-remote-crypto`.
2. Create context (zero-config): `const manager = createCryptoGitContext()`.
3. Build SSH profile: `{ name, url: "git@github.com:org/repo.git", dir, ref, key, privateKey, passphrase?, port? }`.
4. Add profile — SSH transport auto-created from `privateKey`: `manager.addProfile(sshProfile)`.
5. Use normally.

During `pull`/`push`, the SSH transport is auto-resolved because the profile has `privateKey`. Each HTTP request spawns a new SSH connection that tunnels a Git smart-HTTP command.

**Expected outcome:** Network traffic goes through SSH; raw Git objects are still encrypted by the crypto layer.

**Constraint:** SSH transport only works in Node.js / Electron. Not available in browser environments.

---

## Scenario: Browser Environment (IndexedDB)

**Goal:** Run in a browser with a virtual filesystem.

1. Import `createCryptoGitContext` from `git-remote-crypto`.
2. Create context (zero-config): `const manager = createCryptoGitContext()`.
3. Add profile with `url`, `dir`, `key` — LightningFS auto-created: `manager.addProfile({ name, url, dir, key: masterKey })`.
4. Use normally — `clone`, `add`, `commit`, `pull`, `push` all work through the virtual filesystem.

To customize the IndexedDB name, pass `fs` explicitly:
```typescript
import { LightningFS } from "@isomorphic-git/lightning-fs";
manager.addProfile({ name, url, dir, key: masterKey, fs: new LightningFS("my-custom-name") });
```

**Expected outcome:** Encrypted Git operations in the browser; data stored in IndexedDB.

---

## Scenario: Commit with Encrypted Message

**Goal:** Push commit with a message that is also encrypted on the remote.

1. Call `manager.commit(name, "feat: add encrypted content", { name, email })`.
2. The commit object's message field is encrypted by `plugin.ts:encryptObject` when the tree is serialized to disk.
3. Headers (`tree`, `author`, `committer`, `gpgsig` if any) pass through unchanged.
4. Only the message text after the double-newline separator is encrypted.

**Expected outcome:** `git log` on the remote shows ciphertext in the message field. Local `git log` on any instance with the same key shows the plaintext message.

---

## Scenario: Tree with Encrypted Filenames

**Goal:** Push a tree where filenames are encrypted.

1. Add file `src/config.json` to the index.
2. Commit — the tree object's entry `100644 src/config.json` has its filename encrypted.
3. Encrypted filename is Base64URL-encoded and stored in the tree binary.
4. On pull, the tree entry name is decrypted back to `src/config.json`.

**Expected outcome:** Remote tree objects contain Base64URL-encoded ciphertext in the filename field. The decrypted filename is restored on read.

---

## Scenario: Partial — Unencrypted Blobs Pass Through

**Goal:** Ensure unencrypted data is not double-encrypted.

1. `encryptObject` checks for `ENC\x01` marker before encrypting.
2. If the marker is present, the blob is skipped (already encrypted).
3. If absent, the blob is encrypted.
4. `decryptObject` checks for the marker before decrypting.
5. If absent, the blob is returned unchanged.

**Expected outcome:** Mixed repos (some encrypted, some not) are handled transparently. Encrypted blobs are encrypted; unencrypted ones pass through.

---

## Scenario: Error — Decryption Failure

**Condition:** Local objects are encrypted but the master key has changed or is incorrect.

1. `createGitCryptoFs.readFile` decompresses the object.
2. `transformer.decryptObject` calls `decryptWithMarker`.
3. `decryptWithMarker` derives the AES key and attempts `crypto.subtle.decrypt`.
4. AES-GCM authentication fails (ciphertext doesn't match the key).
5. The error is caught in `plugin.ts:decryptObject` (line 101).
6. The original encrypted object is returned unchanged.

**Result:** The local object remains encrypted on disk. Working tree content is garbled. There is no error thrown to the caller — the failure is silent.

**Severity:** High. This is a security concern — users cannot distinguish between "decryption failed" and "this data was never encrypted."

---

## Scenario: Error — SSH Connection Failure

**Condition:** SSH server is unreachable, key is invalid, or host is unknown.

1. `createSshHttpClient` creates a new `ssh2.Client`.
2. `conn.on("error")` fires on connection failure.
3. The promise rejects with the SSH error.
4. isomorphic-git propagates the error to the caller.

**Result:** The `pull`/`push` call throws. The user sees the SSH connection error.

---

## Scenario: Error — Profile Not Found

**Condition:** A method is called with a profile name that does not exist.

1. `getProfileContext(name)` calls `profiles.get(name)`.
2. Returns `undefined` if not found.
3. Throws `Error: Profile "..." not found`.

**Result:** Immediate error with clear message.

---

## Scenario: Error — No Filesystem

**Condition:** A `RepoProfile`/`SshRepoProfile` is used in an environment where `import("node:fs")` fails.

1. `getProfileContext(name)` resolves baseFs via `resolveFs()`.
2. For Node profiles, attempts dynamic `import("node:fs")`.
3. If the import fails or returns nothing, `baseFs` is falsy → throws `Error: No filesystem client found for profile "..."`.

**Result:** Immediate error with clear message. Note: in Node.js environments this error should not occur since `fs` is a built-in module.

---

## Scenario: Concurrent Operations

**Condition:** Two `pull` or `push` calls on the same profile.

1. Each `createGitCryptoFs` instance is independent (created per `getProfileContext` call).
2. Each SSH request creates an independent connection.
3. isomorphic-git does not serialize operations — concurrent calls may interleave at the filesystem level.

**Result:** Undefined behavior. Users must serialize operations externally. No built-in concurrency guard.

---

## Scenario: SSH URL Formats

**Supported URL formats:**

| Format | Parsed as |
|--------|-----------|
| `git@github.com:org/repo.git` | username=git, host=github.com, repoPath=org/repo.git |
| `ssh://git@github.com/org/repo.git` | username=git, host=github.com, repoPath=org/repo.git |

**Unsupported:** URLs without a `:` or `/` separator, IPv6 hosts, custom ports in URL (use `SshRepoProfile.port`).

---

## Scenario: Tagged Objects (Untested)

**Condition:** Repository contains tag objects.

1. `plugin.ts` handles `blob`, `tree`, and `commit` types.
2. Tag objects fall through the type switch and are returned unchanged.
3. Tag content (`tag`, `tagger`, `object`, `type`, `message`) is neither encrypted nor decrypted.

**Result:** Tag objects are stored and transferred in plaintext. This is a gap in coverage.

---

## Scenario: Key Derivation Info Strings

**Detail:** HKDF derivation uses fixed `info` strings:

| Derivation | Info string |
|------------|-------------|
| HMAC key | `git-remote-crypto:hmac` |
| AES key | `git-remote-crypto:aes` |

These are hardcoded in `crypto.ts`. Changing them would break compatibility with existing repositories.

---

## Scenario: Marker Protocol

**Detail:** The `ENC\x01` marker enables three states for any Git object content:

| State | Behavior |
|-------|----------|
| No marker | Encrypt on write, pass through on read |
| Has marker | Encrypt on write (skip), decrypt on read |

This allows gradual migration — repositories can have some encrypted and some unencrypted objects simultaneously.
