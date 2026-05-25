# git-remote-crypto

`git-remote-crypto` is a high-performance, universal zero-knowledge client-side encryption wrapper built on top of `isomorphic-git`. It intercepts raw Git loose objects at the input/output (I/O) layer, executing transparent encryption and decryption **on the fly** without altering Git's native history tracking capabilities or core mechanics. 

By utilizing deterministic encryption schemas, identical input payloads consistently map to the identical ciphertexts. This design guarantees complete Git hash stability, allowing standard delta compression, repository merges, and branch tracking to work smoothly while ensuring your data remains completely encrypted on remote servers (e.g., GitHub, GitLab).

---

## Features

- 🔒 **Zero-Knowledge Architecture**: Encryption and decryption happen exclusively in client memory. Raw master keys never touch network interfaces or remote servers.
- ⚡ **Git Hash Stability**: Deterministic AES-GCM encryption ensures identical objects yield matching hashes, preventing tree drift and tracking anomalies.
- 🌐 **Isomorphic Design**: Runs seamlessly across client-side environments, including Node.js (>=24.14.0), Electron runtimes, and modern Web Browsers.
- 🛡️ **In-Memory Hardening**: Cryptographic operations consume non-extractable Web Crypto `CryptoKey` identifiers inside an isolated, secure buffer system.
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

### Variant A: Node.js or Electron Runtime Execution

```typescript
import { createCryptoGitContext, RepoProfile } from "git-remote-crypto";
import nodeFs from "fs";
import nodeHttp from "isomorphic-git/http/node";

/**
 * Initialize an orchestration context targeting Node runtime modules.
 * @type {CryptoGitManager<RepoProfile>}
 */
const gitManager = createCryptoGitContext<RepoProfile>(nodeHttp, nodeFs);

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
await webGitManager.push("secure-backend-repo");
```

### Variant B: Modern Browsers (Vite / Webpack / React / Vue / Obsidian Plugins)

```typescript
import { createCryptoGitContext, BrowserRepoProfile } from "git-remote-crypto";
import browserHttp from "isomorphic-git/http/web";
import LightningFS from "@isomorphic-git/lightning-fs";

/**
 * Initialize your preferred client-side virtual filesystem block.
 * @type {LightningFS}
 */
const fsClient = new LightningFS("git-indexeddb-storage");

/**
 * Instantiates a web-focused interface instance.
 * @type {CryptoGitManager<BrowserRepoProfile>}
 */
const webGitManager = createCryptoGitContext<BrowserRepoProfile>(browserHttp);

/**
 * Attach a browser repository target configuration mapping its unique FS instance.
 */
webGitManager.addProfile({
  name: "secure-browser-vault",
  url: "https://github.com",
  dir: "/vault-project",
  ref: "main",
  key: masterKey,
  fs: fsClient
});

/**
 * Clone remote streams; payload encryption resolves transparently onto local writes.
 */
await webGitManager.clone("secure-browser-vault");

/**
 * Pull down encrypted changes down to clean decrypted local layouts.
 */
await webGitManager.pull("secure-browser-vault");
```

---

## API Reference

### `createCryptoGitContext(httpClient, defaultFs?)`
Constructs a unified storage interface abstraction.
- `httpClient`: An active network module adapter (`isomorphic-git/http/node` or `isomorphic-git/http/web`).
- `defaultFs`: Fallback server-side filesystem instance (e.g., Node's `fs`). Optional if using explicitly typed virtual environment profile maps.

### `CryptoGitManager` Operations
- `addProfile(profile)`: Enrolls a distinct encrypted profile block matrix lookup configuration.
- `removeProfile(name)`: Erases a targeted identity configuration pattern from context cache memory.
- `getProfile(name)`: Queries internal dictionary lookups to extract working parameter structures.
- `init(name)`: Sets up a fresh Git space, writing custom configuration flags (`core.encrypted = true`).
- `clone(name, options?)`: Synchronizes complete remote tracks, enforcing on-the-fly encryption constraints across disk payloads.
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

---

## License

MIT © [ASA-GH](https://github.com)
