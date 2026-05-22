import git from "isomorphic-git";
import { RepoProfile, BrowserRepoProfile, SecureBinaryData } from "./types.js";
import { createGitCryptoFs } from "./gitFsAdapter.js";

export { importMasterKey } from "./crypto.js";
export type { RepoProfile, BrowserRepoProfile, SecureBinaryData };

/**
 * Universal repository orchestrator capable of managing zero-knowledge encrypted Git workflows
 * across Node.js, Electron, and modern web browser environments.
 */
export interface CryptoGitManager<P extends RepoProfile | BrowserRepoProfile> {
  addProfile(profile: P): void;
  removeProfile(name: string): void;
  getProfile(name: string): P | undefined;
  init(name: string): Promise<void>;
  clone(name: string, options?: { ref?: string; depth?: number }): Promise<void>;
  pull(name: string): Promise<void>;
  push(name: string, remote?: string): Promise<void>;
  commit(name: string, message: string, author?: { name: string; email: string }): Promise<string>;
}

/**
 * Instantiates a universal cryptographic Git client context.
 * Couples native isomorphic-git network behaviors with customized transparent I/O interceptors.
 *
 * @param httpClient - The required network request handler adapter (e.g., isomorphic-git/http/node or /http/web).
 * @param defaultFs - The primary server-side file system implementation (e.g., Node.js native 'fs'). Optional if using virtual client providers.
 * @returns An initialized manager runtime instances supporting strict profile lookups.
 * @throws {Error} If the provided network interface driver client is missing.
 */
export function createCryptoGitContext<P extends RepoProfile | BrowserRepoProfile>(
  httpClient: any,
  defaultFs?: any
): CryptoGitManager<P> {
  if (!httpClient) {
    throw new Error("HTTP client adapter is required (isomorphic-git/http/node or /http/web)");
  }

  const profiles = new Map<string, P>();

  const getProfileContext = (name: string) => {
    const profile = profiles.get(name);
    if (!profile) throw new Error(`Profile "${name}" not found`);

    const baseFs = ('fs' in profile) ? (profile as any).fs : defaultFs;
    if (!baseFs) throw new Error(`No filesystem client found for profile "${name}"`);

    const cryptoFs = createGitCryptoFs(baseFs, profile.key);

    return { profile, cryptoFs };
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
      const { profile, cryptoFs } = getProfileContext(name);
      await git.init({ fs: cryptoFs, dir: profile.dir });
      await git.setConfig({ fs: cryptoFs, dir: profile.dir, path: "core.encrypted", value: "true" });
    },
    async clone(name, options) {
      const { profile, cryptoFs } = getProfileContext(name);
      await git.clone({
        fs: cryptoFs,
        http: httpClient,
        dir: profile.dir,
        url: profile.url,
        ref: options?.ref ?? profile.ref,
        depth: options?.depth,
      });
    },
    async pull(name) {
      const { profile, cryptoFs } = getProfileContext(name);
      await git.pull({
        fs: cryptoFs,
        http: httpClient,
        dir: profile.dir,
        ref: profile.ref ?? "main",
        singleBranch: true,
      });
    },
    async push(name, remote) {
      const { profile, cryptoFs } = getProfileContext(name);
      await git.push({
        fs: cryptoFs,
        http: httpClient,
        dir: profile.dir,
        remote: remote ?? profile.remote ?? "origin",
        ref: profile.ref ?? "main",
      });
    },
    async commit(name, message, author) {
      const { profile, cryptoFs } = getProfileContext(name);
      return git.commit({
        fs: cryptoFs,
        dir: profile.dir,
        message,
        author,
      });
    },
  };
}