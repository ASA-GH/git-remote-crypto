# git-remote-crypto

`git-remote-crypto` is a high-performance, universal zero-knowledge client-side encryption wrapper built on top of `isomorphic-git`. It intercepts raw Git loose objects at the input/output (I/O) layer, executing transparent encryption and decryption **on the fly** without altering Git's native history tracking capabilities or core mechanics.

By utilizing deterministic encryption schemas, identical input payloads consistently map to the identical ciphertexts. This design guarantees complete Git hash stability, allowing standard delta compression, repository merges, and branch tracking to work smoothly while ensuring your data remains completely encrypted on remote servers (e.g., GitHub, GitLab).

---

## Features

- 🔒 **Zero-Knowledge Architecture**: Encryption and decryption happen exclusively in client memory. Raw master keys never touch network interfaces or remote servers.
- ⚡ **Git Hash Stability**: Deterministic AES-GCM encryption ensures identical objects yield matching hashes, preventing tree drift and tracking anomalies.
- 🌐 **Isomorphic Design**: Runs seamlessly across client-side environments, including Node.js (>=24.14.0), Electron runtimes, and modern Web Browsers.
- 🔑 **Built-in Pure-JS SSH Transport**: Tunnels smart-HTTP Git RPC commands directly through a secure SSH session via Node/Electron without calling native system git or ssh binaries.
- 🛡️ **In-Memory Hardening**: Cryptographic operations consume non-extractable Web Crypto `CryptoKey` identifiers inside an isolated, secure buffer system.
- ⚙️ **Zero-Configuration Setup**: `createCryptoGitContext()` — no httpClient, no fs, no imports from `isomorphic-git`. Just import from `git-remote-crypto` and go.
- 🧩 **Zero-Configuration Hooks**: Replaces complex pipeline setups by proxying the core filesystem layer directly within `isomorphic-git`.

---

## Installation

Install the package alongside its peer dependencies:

```bash
npm install git-remote-crypto
```

---

## Initializing Keys

The library exports `importMasterKey` to ingest secure binary inputs (like raw key views or key derivation outputs) and construct hardened cryptographic contexts.

```typescript
import { importMasterKey } from "git-remote-crypto";

/**
 * Initialize a 32-byte secure key view array.
 * @type {Uint8Array}
 */
const rawKeyBytes = new Uint8Array([/* 32 secret bytes */]);

/**
 * Hardened master cryptographic context key.
 * @type {CryptoKey}
 */
const masterKey = await importMasterKey(rawKeyBytes);
```

---

## Usage Guide

### Variant A: Node.js or Electron Runtime Execution (HTTPS)

```typescript
import { createCryptoGitContext, RepoProfile } from "git-remote-crypto";

/**
 * Zero-config: auto-resolves isomorphic-git/http/node + fs.
 * @type {CryptoGitManager<RepoProfile>}
 */
const gitManager = createCryptoGitContext<RepoProfile>();

/**
 * Map a secure execution profile configuration.
 */
gitManager.addProfile({
  name: "secure-backend-repo",
  url: "https://github.com",
  dir: "./my-local-secure-repo",
  ref: "main",
  remote: "origin",
  key: masterKey
});

/**
 * Setup a clean local layout containing internal repository encryption locks.
 */
await gitManager.init("secure-backend-repo");

/**
 * Stage a single file or multiple changed files into the Git index.
 */
await gitManager.add("secure-backend-repo", ["src/index.ts", "config.json"]);

/**
 * Create transparently encrypted commits seamlessly.
 * @type {string}
 */
const commitSha = await gitManager.commit(
  "secure-backend-repo",
  "feat: commit transparently encrypted at rest",
  { name: "Developer", email: "dev@crypto.org" }
);

/**
 * Sync securely to remote server streams.
 */
await gitManager.push("secure-backend-repo");
```

### Variant B: Modern Browsers (Vite / Webpack / React / Vue / Obsidian Mobile Plugins)

```typescript
import { createCryptoGitContext, BrowserRepoProfile } from "git-remote-crypto";

/**
 * Zero-config: auto-resolves isomorphic-git/http/web + LightningFS("git-remote-crypto").
 * Override fs in profile to customize the IndexedDB name.
 * @type {CryptoGitManager<BrowserRepoProfile>}
 */
const webGitManager = createCryptoGitContext<BrowserRepoProfile>();

/**
 * Attach a browser repository target — LightningFS auto-created if fs not provided.
 */
webGitManager.addProfile({
  name: "secure-browser-vault",
  url: "https://github.com",
  dir: "/vault-project",
  ref: "main",
  key: masterKey
});

/**
 * Clone remote streams; payload encryption resolves transparently onto local writes.
 */
await webGitManager.clone("secure-browser-vault");

/**
 * Pull down encrypted changes down to clean decrypted local layouts.
 */
await webGitManager.pull("secure-browser-vault");

/**
 * Stage modifications inside the browser virtual filesystem environment.
 */
await webGitManager.add("secure-browser-vault", "notes/secret-note.md");

/**
 * Commit local virtual data frames safely.
 * @type {string}
 */
await webGitManager.commit("secure-browser-vault", "docs: update browser notes");
```

### Variant C: Native SSH Transport (Node.js / Electron / Obsidian Desktop Plugins)

To execute secure network synchronization routines via pure JavaScript SSH tunneling without requiring a local machine `git` installation or environment shell scripts:

```typescript
import { createCryptoGitContext, SshRepoProfile } from "git-remote-crypto";

/**
 * Zero-config: SSH profile auto-creates transport via createSshHttpClient.
 */
const gitManager = createCryptoGitContext<SshRepoProfile>();

/**
 * Map a native SSH repository profile definition.
 */
const sshProfile: SshRepoProfile = {
  name: "secure-ssh-repo",
  url: "git@github.com:username/encrypted-repo.git",
  dir: "./my-local-secure-repo",
  ref: "main",
  key: masterKey,
  privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEogIBAAKCAQ...`, // The raw private key string
  passphrase: "optional-key-passphrase",
  port: 22 // Optional custom port mapping override
};

gitManager.addProfile(sshProfile);

/**
 * Network operations will seamlessly communicate via SSH transport layers.
 */
await gitManager.pull("secure-ssh-repo");
await gitManager.push("secure-ssh-repo");
```

---

## API Reference

### `createCryptoGitContext(defaultFs?)`
Constructs a zero-config cryptographic Git manager. Auto-resolves `httpClient` and `fs` per-profile.
- `defaultFs`: Fallback server-side filesystem instance (e.g., Node's `fs.promises`). Only used for `RepoProfile`/`SshRepoProfile` when not in a browser. Omitted for zero-config — auto-imports `fs`.

### `CryptoGitManager` Operations
- `addProfile(profile)`: Enrolls a distinct encrypted profile block matrix lookup configuration (`RepoProfile | BrowserRepoProfile | SshRepoProfile`).
- `removeProfile(name)`: Erases a targeted identity configuration pattern from context cache memory.
- `getProfile(name)`: Queries internal dictionary lookups to extract working parameter structures.
- `init(name)`: Sets up a fresh Git space, writing custom configuration flags (`core.encrypted = true`).
- `clone(name, options?)`: Synchronizes complete remote tracks, enforcing on-the-fly encryption constraints across disk payloads.
- `add(name, filepath)`: Stages a single file path or an array of files into the Git index using the transparently encrypted proxy filesystem layer.
- `pull(name)`: Pulls down remote encrypted frames, inflating and restoring transparent plaintext objects locally.
- `push(name, remote?)`: Bundles deterministic local loose structures onto remote servers.
- `commit(name, message, author?)`: Assembles native structural trees and messages, outputting encrypted metadata directly onto active storage targets.

---

## Subpath Direct Module Consumption

Advanced projects demanding decoupled cryptographic utilities, structural payload parsers, or discrete binary format serializers can access isolated subpaths directly:

```typescript
import { 
  encryptDeterministic, 
  decryptWithMarker,
  parseTree,
  serializeTree,
  parseCommit,
  serializeCommit 
} from "git-remote-crypto/core";
```

For setting up standalone network proxies or customized protocol translation brokers inside Node runtimes:

```typescript
import { createSshHttpClient } from "git-remote-crypto/transport/ssh";
```

---

## License

MIT © [ASA-GH](https://github.com)