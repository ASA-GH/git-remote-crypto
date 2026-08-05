# Architecture

## Overview

`git-remote-crypto` is a zero-knowledge client-side encryption wrapper built on top of `isomorphic-git`. It intercepts raw Git loose objects at the I/O layer, applying transparent encryption and decryption without altering Git's native history tracking or hash mechanics.

The key design principle: deterministic encryption ensures identical input payloads always produce identical ciphertexts, preserving Git hash stability. This allows standard delta compression, merges, and branch tracking to work normally while keeping data encrypted on remote servers.

## Entry Points

The package exposes three subpath entry points:

| Export | Source | Purpose |
|--------|--------|---------|
| `git-remote-crypto` | `src/index.ts` | High-level orchestrator — `createCryptoGitContext`, `importMasterKey`, `createSshHttpClient`, profile types, `HttpClient` |
| `git-remote-crypto/core` | `src/core.ts` | Low-level primitives — `encryptDeterministic`, `decryptWithMarker`, parsers, `createSecureBuffer` |
| `git-remote-crypto/transport/ssh` | `src/transport/ssh.ts` | Pure-JS SSH proxy — `createSshHttpClient` |

## Module Overview

```
src/
├── index.ts           # createCryptoGitContext → CryptoGitManager
├── core.ts            # Re-exports low-level primitives
├── types.ts           # Shared interfaces (SecureBinaryData, profiles, TreeEntry)
├── crypto.ts          # HKDF key derivation, deterministic AES-256-GCM encrypt/decrypt
├── plugin.ts          # createCryptoTransformer — encrypt/decrypt logic per Git object type
├── gitFsAdapter.ts    # createGitCryptoFs — filesystem proxy wrapping baseFs
├── utils.ts           # Buffer utilities (SecureBinaryData, TextEncoder/Decoder)
├── parsers.ts         # Git object format parsers/serializers (blob, tree, commit)
└── transport/
    └── ssh.ts         # SSH tunnel for isomorphic-git HTTP client
```

## Data Flow

```
createCryptoGitContext(defaultFs?)
    │
    ├─→ profiles: Map<string, Profile>
    │
    └─→ CryptoGitManager
          │
          ├─ init()    → git.init({ fs: cryptoFs, ... })
          ├─ clone()   → git.clone({ fs: cryptoFs, http: activeHttp, ... })
          ├─ add()     → git.add({ fs: cryptoFs, ... })
          ├─ commit()  → git.commit({ fs: cryptoFs, ... })
          ├─ pull()    → git.pull({ fs: cryptoFs, http: activeHttp, ... })
          └─ push()    → git.push({ fs: cryptoFs, http: activeHttp, ... })
```

Each manager method resolves a profile by name via `getProfileContext(name)`, which performs **per-profile auto-resolution**:
1. **cryptoFs** — `createGitCryptoFs(baseFs, masterKey)` — a filesystem proxy
2. **activeHttpClient** — resolved per-profile type:
   - `RepoProfile` → dynamic `import("isomorphic-git/http/node")`
   - `BrowserRepoProfile` → dynamic `import("isomorphic-git/http/web")`
   - `SshRepoProfile` → `createSshHttpClient(profile)`
3. **baseFs** — resolved per-profile type:
   - `BrowserRepoProfile` with `fs` → use provided `fs`
   - `BrowserRepoProfile` without `fs` → dynamic `import("@isomorphic-git/lightning-fs")` → `new LightningFS("git-remote-crypto")`
   - `RepoProfile` / `SshRepoProfile` → `defaultFs` parameter, or dynamic `import("fs")` → `fs.promises`

All are injected into isomorphic-git's API calls. The zero-config approach means consumers never import `isomorphic-git` or `fs` directly.

## Crypto Layer

### Key Management

```
importMasterKey(rawBytes: Uint8Array)
    └─→ CryptoKey (non-extractable, HKDF, ["deriveKey"])
```

Raw bytes are imported as a non-extractable HKDF secret key. From this master key, per-operation keys are derived using HKDF with SHA-256:

- **HMAC key**: `info = "git-remote-crypto:hmac"` → HMAC-SHA256 (256-bit)
- **AES key**: `info = "git-remote-crypto:aes"` → AES-256-GCM

### Deterministic Encryption

```
encryptDeterministic(plain, masterKey)
    ├─→ derive HMAC key (HKDF)
    ├─→ derive AES key (HKDF)
    ├─→ IV = first 12 bytes of HMAC(plain, hmacKey)    ← deterministic
    ├─→ ciphertext = AES-256-GCM(plain, aesKey, IV)
    └─→ result = [ENC\x01][IV (12 bytes)][ciphertext]
```

The IV is derived from the HMAC of the plaintext content, not random. This means `encryptDeterministic(plaintext, key)` always produces the same output for the same inputs, preserving Git object hashes.

### Decryption

```
decryptWithMarker(encryptedData, masterKey)
    ├─→ validate ENC\x01 marker at offset 0
    ├─→ extract IV from bytes 4..16
    ├─→ extract ciphertext from bytes 16..
    ├─→ derive AES key (HKDF)
    └─→ plaintext = AES-256-GCM-decrypt(ciphertext, aesKey, IV)
```

### Data Marker

Encrypted payloads start with the 4-byte marker `ENC\x01` (hex: `0x45 0x4E 0x43 0x01`). The transformer checks for this marker to decide whether to encrypt or skip a payload, enabling transparent handling of both encrypted and unencrypted objects.

## Plugin / Transformer Layer

`createCryptoTransformer({ masterKey })` returns an object with `encryptObject` and `decryptObject` methods. Processing is type-aware:

| Git Object Type | Encryption Scope | Decryption Scope |
|-----------------|------------------|------------------|
| `blob` | Full content | Full content (skipped if marker absent) |
| `tree` | Each entry's filename (Base64URL-encoded in binary) | Each entry's filename |
| `commit` | Message text only; headers pass through unchanged | Message text only |
| `tag` | Not handled — passes through unchanged | Not handled |

Tree entry names are individually encrypted and encoded as Base64URL to avoid special character issues in the Git tree binary format.

## File System Adapter Layer

`createGitCryptoFs(baseFs, masterKey)` returns a proxy that intercepts `readFile` and `writeFile` calls:

```
writeFile(path, data)
    └─ if isGitObjectPath(path)    // .git/objects/ but not packs/info
        ├─ pako.inflate(data)      → decompress
        ├─ parse header: "type size\0"
        ├─ transformer.encryptObject(content)
        └─ pako.deflate(result)    → re-compress

readFile(path)
    ├─ baseFs.readFile(path)       → raw compressed data
    ├─ if isGitObjectPath(path)
    │   ├─ pako.inflate(data)
    │   ├─ transformer.decryptObject(content)
    │   └─ return transformed
    └─ return raw data
```

The `isGitObjectPath` check filters to `.git/objects/` paths, excluding pack files and info directories.

## Transport Layer — SSH

`createSshHttpClient(profile)` returns an isomorphic-git-compatible HTTP client. It is auto-created for `SshRepoProfile` profiles — consumers never call it directly in the zero-config flow.

```typescript
// Zero-config: SshRepoProfile auto-creates SSH transport
const manager = createCryptoGitContext();
manager.addProfile({ name: "ssh-repo", url: "git@github.com:org/repo.git", dir: "./repo", key, privateKey: "..." });
await manager.pull("ssh-repo"); // SSH transport created automatically
```

`createSshHttpClient` is also re-exported from the package root for consumers who need it for testing or custom composition:

```typescript
import { createSshHttpClient } from "git-remote-crypto";
```

```
request({ url, method, headers, body })
    ├─ parse SSH URL → { host, username, repoPath }
    ├─ new ssh2.Client()
    ├─ on ready:
    │   ├─ /info/refs?service=git-upload-pack  → git-upload-pack 'repoPath'
    │   ├─ /git-upload-pack                    → git-upload-pack 'repoPath'
    │   └─ /git-receive-pack                   → git-receive-pack 'repoPath'
    ├─ stream body if present
    ├─ collect response stream
    └─ resolve with isomorphic-git-compatible response shape
```

Each request creates a fresh SSH connection. The client translates HTTP smart-HTTP endpoints into SSH exec commands, forwarding request bodies and collecting responses.

## Type System

### SecureBinaryData

```typescript
type SecureBinaryData = Uint8Array & { buffer: ArrayBuffer };
```

Enforced non-`SharedArrayBuffer` backing for Web Crypto API compatibility. The `toSBD()` utility in `utils.ts` validates and copies from `SharedArrayBuffer` if needed.

### Repository Profiles

Three profile variants support different runtime environments. All transports are auto-resolved — no `httpClient` or `fs` required in the profile:

| Profile | Runtime | Auto-Resolved Transports |
|---------|---------|--------------------------|
| `RepoProfile` | Node.js / Electron (HTTPS) | HTTP: `isomorphic-git/http/node` + `fs.promises` |
| `BrowserRepoProfile` | Browser | HTTP: `isomorphic-git/http/web` + FS: `LightningFS` (optional, auto-created) |
| `SshRepoProfile` | Node.js / Electron (SSH) | HTTP: `createSshHttpClient(profile)` (auto-created from `privateKey`) |

### HttpClient Interface

```typescript
interface HttpClient {
  request: (opts: { url: string; method?: string; headers?: Record<string,string>; body?: any })
    => Promise<{ url: string; method?: string; headers?: Record<string,string>; statusCode: number; statusMessage: string }>;
}
```

Used by clone, pull, push operations. Implemented by `isomorphic-git/http/node`, `isomorphic-git/http/web`, and `createSshHttpClient`.

## Dependencies

| Dependency | Role |
|------------|------|
| `isomorphic-git` (peer) | Underlying Git operations |
| `ssh2` | Node.js SSH client for transport proxy |
| `pako` | Gzip inflate/deflate for Git loose objects |
| Web Crypto API (built-in) | HKDF, HMAC, AES-GCM — all cryptography |
