import git from "isomorphic-git";
import { RepoProfile, BrowserRepoProfile, SshRepoProfile, HttpClient } from "./types.js";
import { createGitCryptoFs } from "./gitFsAdapter.js";
export { importMasterKey } from "./crypto.js";
export { createSshHttpClient } from "./transport/ssh.js";
export type { RepoProfile, BrowserRepoProfile, SshRepoProfile, HttpClient };
export type { SecureBinaryData } from "./types.js";

type AnyRepoProfile = RepoProfile | BrowserRepoProfile | SshRepoProfile;

/**
 * Universal repository orchestrator capable of managing zero-knowledge encrypted Git workflows
 * across Node.js, Electron, and modern web browser environments.
 */
export interface CryptoGitManager<P extends AnyRepoProfile> {
  /** Register a repository profile for later use. */
  addProfile(profile: P): void;
  /** Remove a previously registered repository profile. */
  removeProfile(name: string): void;
  /** Look up a registered repository profile by name. */
  getProfile(name: string): P | undefined;
  /** Initialize an empty repository at the profile's directory. */
  init(name: string): Promise<void>;
  /** Clone a remote repository into the profile's directory. */
  clone(name: string, options?: { ref?: string; depth?: number }): Promise<void>;
  /** Stage one or more files for the next commit. */
  add(name: string, filepath: string | string[]): Promise<void>;
  /** Pull latest changes from the remote. */
  pull(name: string): Promise<void>;
  /** Push local commits to the remote. */
  push(name: string, remote?: string): Promise<void>;
  /** Create a new commit from the staged files. */
  commit(name: string, message: string, author?: { name: string; email: string }): Promise<string>;
}

interface ProfileContext {
  profile: AnyRepoProfile;
  cryptoFs: ReturnType<typeof createGitCryptoFs>;
  httpClient: HttpClient;
}

async function resolveHttpClient(profile: AnyRepoProfile): Promise<HttpClient> {
  if ("privateKey" in profile) {
    // SshRepoProfile — auto-create SSH transport
    const { createSshHttpClient } = await import("./transport/ssh.js");
    return createSshHttpClient(profile as SshRepoProfile);
  }

  if ("fs" in profile && profile.fs !== undefined) {
    // BrowserRepoProfile — browser HTTP
    const mod = await import("isomorphic-git/http/web");
    return mod.default as HttpClient;
  }

  // RepoProfile — Node.js HTTP
  const mod = await import("isomorphic-git/http/node");
  return mod.default as HttpClient;
}

async function resolveFs(
  profile: AnyRepoProfile,
  defaultFs: any
): Promise<any> {
  // BrowserRepoProfile — use provided or create LightningFS
  if ("fs" in profile) {
    const browserFs = (profile as BrowserRepoProfile).fs;
    if (browserFs !== undefined) {
      return browserFs;
    }
    const { default: LightningFS } = await import("@isomorphic-git/lightning-fs");
    return new (LightningFS as any)("git-remote-crypto");
  }

  // RepoProfile / SshRepoProfile — use defaultFs or auto-import Node fs
  if (defaultFs !== undefined) {
    return defaultFs;
  }
  const { default: nodeFs } = await import("node:fs");
  return nodeFs.promises;
}

/**
 * Instantiates a universal cryptographic Git client context.
 * Zero-config: auto-detects environment and resolves httpClient + fs per-profile.
 *
 * @param defaultFs - The default filesystem implementation (e.g., Node.js native `fs`).
 *                    Optional for browser profiles (uses LightningFS by default).
 * @returns An initialized manager supporting profile-based per-repo configuration.
 */
export function createCryptoGitContext<P extends AnyRepoProfile>(
  defaultFs?: any
): CryptoGitManager<P> {
  const profiles = new Map<string, P>();

  const getProfileContext = async (name: string): Promise<ProfileContext> => {
    const profile = profiles.get(name);
    if (!profile) throw new Error(`Profile "${name}" not found`);

    const baseFs = await resolveFs(profile, defaultFs);
    if (!baseFs) throw new Error(`No filesystem client found for profile "${name}"`);

    const cryptoFs = createGitCryptoFs(baseFs, profile.key);
    const httpClient = await resolveHttpClient(profile);

    return { profile, cryptoFs, httpClient };
  };

  return {
    addProfile(profile) {
      profiles.set(profile.name, profile);
    },
    removeProfile(name) {
      profiles.delete(name);
    },
    getProfile(name) {
      return profiles.get(name);
    },
    async init(name) {
      const { profile, cryptoFs } = await getProfileContext(name);
      await git.init({ fs: cryptoFs, dir: profile.dir });
      await git.setConfig({ fs: cryptoFs, dir: profile.dir, path: "core.encrypted", value: "true" });
    },
    async clone(name, options) {
      const { profile, cryptoFs, httpClient } = await getProfileContext(name);
      await git.clone({
        fs: cryptoFs,
        http: httpClient,
        dir: profile.dir,
        url: profile.url,
        ref: options?.ref ?? profile.ref,
        depth: options?.depth,
      });
    },
    async add(name, filepath) {
      const { profile, cryptoFs } = await getProfileContext(name);

      if (Array.isArray(filepath)) {
        for (const file of filepath) {
          await git.add({ fs: cryptoFs, dir: profile.dir, filepath: file });
        }
      } else {
        await git.add({ fs: cryptoFs, dir: profile.dir, filepath });
      }
    },
    async pull(name) {
      const { profile, cryptoFs, httpClient } = await getProfileContext(name);
      await git.pull({
        fs: cryptoFs,
        http: httpClient,
        dir: profile.dir,
        ref: profile.ref ?? "main",
        singleBranch: true,
      });
    },
    async push(name, remote) {
      const { profile, cryptoFs, httpClient } = await getProfileContext(name);
      await git.push({
        fs: cryptoFs,
        http: httpClient,
        dir: profile.dir,
        remote: remote ?? profile.remote ?? "origin",
        ref: profile.ref ?? "main",
      });
    },
    async commit(name, message, author) {
      const { profile, cryptoFs } = await getProfileContext(name);
      return git.commit({
        fs: cryptoFs,
        dir: profile.dir,
        message,
        author,
      });
    },
  };
}
