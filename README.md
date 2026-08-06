# git-remote-crypto

`git-remote-crypto` is a zero-knowledge encryption layer built on top of [`isomorphic-git`](https://isomorphic-git.org/). It intercepts Git operations at the filesystem level, transparently encrypting and decrypting objects on the fly — without altering Git's native history, hash mechanics, or branch tracking.

**How it works:** you call `isomorphic-git` operations through `git-remote-crypto`'s manager. We proxy the filesystem layer, intercept writes to `.git/objects/`, and encrypt/decrypt each object before it hits disk. Your Git history stays identical — same hashes, same merges — but the content is always encrypted at rest.

By using deterministic AES-256-GCM encryption (IV derived from HMAC of content), identical inputs always produce identical ciphertexts. This preserves Git hash stability and prevents tree drift during merges.

---

## Features

- 🔒 **Zero-Knowledge**: Encryption and decryption happen exclusively in client memory. Master keys never leave your machine.
- ⚡ **Hash Stability**: Deterministic encryption means identical content → identical hashes. No tree drift on merges.
- 🌐 **Universal Runtime**: Node.js (>=22.0.0), Electron, and modern browsers (Vite, Webpack, React, Vue, Obsidian plugins).
- 🔑 **Built-in SSH Transport**: Pure-JS SSH tunneling for smart-HTTP Git — no native `git` or `ssh` binaries required.
- ⚙️ **Zero-Config**: `createCryptoGitContext()` — no HTTP client setup, no filesystem wiring. Just import and go.

---

## Installation

Install the package — all dependencies are bundled:

```bash
npm install git-remote-crypto
```

### Dependencies

| Dependency | Role | Runtime |
|---|---|---|
| `isomorphic-git` | Git operations engine | Node, Browser |
| `ssh2` | SSH transport | Node, Electron |
| `@isomorphic-git/lightning-fs` | Virtual browser filesystem | Browser only |
| `pako` | gzip compression | All |

No additional setup required. `git-remote-crypto` manages all transitive dependencies internally.

---

## Limitations

- **Loose objects only**: Currently only encrypts/decrypts Git loose objects (`.git/objects/xx/yy`). Packfiles and Git LFS are not supported.
- **Tag objects pass through**: `git tag` objects are not encrypted — only `blob`, `tree`, and `commit` types are processed.
- **No Git LFS**: Large files managed via Git LFS are not intercepted.
- **Browser storage limits**: `lightning-fs` uses IndexedDB, which has practical limits (~50-80% of disk space). Large repos may need manual storage management.
- **Browser-only in main process**: `BrowserRepoProfile` with `lightning-fs` does not work in Electron's main process, Web Workers without IndexedDB support, or SSR environments (Next.js server-side rendering). Use `RepoProfile` for those.

---

## Security Warnings

- **Lose your key, lose your data**: If you lose your master key, all encrypted content is permanently unrecoverable. There is no key recovery mechanism. Back up your master key securely.
- **Key rotation is not yet supported**: Changing the master key requires re-encrypting all content manually. This is planned for a future release.
- **Silent fallback on crypto errors**: If encryption or decryption fails internally, the original object is returned unchanged. This prevents crashes but means encrypted data could be read as plaintext (or vice versa) without explicit errors. This is a known issue being tracked for remediation.

---

## Initializing Keys

The library exports `importMasterKey` to ingest raw key bytes and construct a `CryptoKey`:

```typescript
import { importMasterKey } from "git-remote-crypto";

const rawKeyBytes = new Uint8Array(32); // 32 bytes = 256 bits
crypto.getRandomValues(rawKeyBytes);
const masterKey = await importMasterKey(rawKeyBytes);
```

Store `rawKeyBytes` securely. It is the only way to recover your data.

---

## Quick Start

```typescript
import { createCryptoGitContext } from "git-remote-crypto";

const manager = createCryptoGitContext();

manager.addProfile({
  name: "my-repo",
  url: "https://github.com/user/repo.git",
  dir: "./my-local-repo",
  key: masterKey,
});

await manager.init("my-repo");
await manager.add("my-repo", "src/app.ts");
await manager.commit("my-repo", "encrypt my work");
await manager.push("my-repo");
```

---

## Usage Guide

### Variant A: Node.js or Electron (HTTPS)

```typescript
import { createCryptoGitContext } from "git-remote-crypto";

const manager = createCryptoGitContext();

manager.addProfile({
  name: "my-repo",
  url: "https://github.com/user/repo.git",
  dir: "./my-local-repo",
  key: masterKey,
});

await manager.init("my-repo");
await manager.add("my-repo", ["src/index.ts", "config.json"]);
await manager.commit("my-repo", "feat: secure commit");
await manager.push("my-repo");
```

Auto-resolves `isomorphic-git/http/node` + Node `fs`.

### Variant B: Browsers (Vite / Webpack / React / Vue / Obsidian)

```typescript
import { createCryptoGitContext } from "git-remote-crypto";

const manager = createCryptoGitContext();

manager.addProfile({
  name: "my-vault",
  url: "https://github.com/user/repo.git",
  dir: "/vault",
  key: masterKey,
  // fs: customFs, // optional — LightningFS("git-remote-crypto") used by default
});

await manager.clone("my-vault");
await manager.pull("my-vault");
await manager.add("my-vault", "notes/secret.md");
await manager.commit("my-vault", "update notes");
```

Auto-resolves `isomorphic-git/http/web` + `lightning-fs` (IndexedDB).

### Variant C: SSH Transport (Node.js / Electron)

```typescript
import { createCryptoGitContext } from "git-remote-crypto";

const manager = createCryptoGitContext();

manager.addProfile({
  name: "my-ssh-repo",
  url: "git@github.com:user/encrypted-repo.git",
  dir: "./my-local-repo",
  key: masterKey,
  privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----\n...`,
  passphrase: "optional", // omit if key has no passphrase
  port: 22, // optional, default 22
});

await manager.pull("my-ssh-repo");
await manager.push("my-ssh-repo");
```

Auto-creates SSH transport via `createSshHttpClient`. No manual HTTP client wiring.

---

## API Reference

### `createCryptoGitContext()`

Creates a zero-config manager. All dependencies are resolved internally via dynamic `import()`.

### `CryptoGitManager.addProfile(profile)`

Registers a repository profile. Accepts `RepoProfile`, `BrowserRepoProfile`, or `SshRepoProfile`. Multiple profiles of different types can coexist in a single manager.

### `CryptoGitManager` Operations

| Method | Description |
|---|---|
| `init(name)` | Initialize encrypted repo, sets `core.encrypted = true` |
| `clone(name, options?)` | Clone remote with on-the-fly encryption |
| `add(name, filepath)` | Stage file(s) for commit |
| `pull(name)` | Pull latest, decrypt on read |
| `push(name, remote?)` | Push, encrypt on write |
| `commit(name, message, author?)` | Create encrypted commit |
| `getProfile(name)` | Lookup registered profile |
| `removeProfile(name)` | Unregister profile |

### Subpath Exports

```typescript
// Cryptographic primitives and parsers
import { encryptDeterministic, decryptWithMarker, parseTree, serializeTree, parseCommit, serializeCommit } from "git-remote-crypto/core";

// SSH HTTP client (Node.js only)
import { createSshHttpClient } from "git-remote-crypto/transport/ssh";
```

---

## Migration from Plain Git

To encrypt an existing plain Git repository:

1. **Backup** your repository and master key.
2. Install `git-remote-crypto` and initialize the manager with your key.
3. Run `git gc` to ensure all objects are loose (packfiles are not intercepted yet).
4. Perform any operation (`add`, `commit`, `push`) — existing objects remain as-is, new objects get encrypted.
5. Verify encrypted objects by checking `.git/objects/` — they should start with the `ENC\x01` marker.
6. For full encryption of existing content, force a rewrite (e.g., amend commits, `git gc`) — this re-processes all objects through the encryption layer.

---

## License

MIT © [ASA-GH](https://github.com)
