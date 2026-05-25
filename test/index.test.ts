import { describe, test, expect, vi, beforeEach } from "vitest";
import git from "isomorphic-git";
import { createCryptoGitContext } from "../src/index.js";
import { createSecureBuffer, importMasterKey, BrowserRepoProfile } from "../src/core.js";

vi.mock("isomorphic-git", () => ({
  default: {
    init: vi.fn(),
    setConfig: vi.fn(),
    clone: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    commit: vi.fn().mockResolvedValue("mock_commit_sha_12345"),
  }
}));

describe("CryptoGitContext Facade Integration Tests", () => {
  let masterKey: CryptoKey;
  let mockHttpClient: any;
  let mockBaseFs: any;
  let testProfile: BrowserRepoProfile;

  beforeEach(async () => {
    vi.clearAllMocks();

    const rawKey = createSecureBuffer(32);
    rawKey.set(new Array(32).fill(9));
    masterKey = await importMasterKey(rawKey);

    mockHttpClient = { request: vi.fn() };
    mockBaseFs = { writeFile: vi.fn(), readFile: vi.fn() };

    testProfile = {
      name: "secure-team-repo",
      url: "https://github.com",
      dir: "/path/to/secure-repo",
      ref: "main",
      remote: "origin",
      key: masterKey,
      fs: mockBaseFs
    };
  });

  /**
   * Assures that profile lifecycle management (adding, getting, and removing profiles) operates as expected.
   */
  test("Should properly manage repository profiles internally", () => {
    const manager = createCryptoGitContext(mockHttpClient);

    expect(manager.getProfile("secure-team-repo")).toBeUndefined();

    manager.addProfile(testProfile);
    expect(manager.getProfile("secure-team-repo")).toStrictEqual(testProfile);

    manager.removeProfile("secure-team-repo");
    expect(manager.getProfile("secure-team-repo")).toBeUndefined();
  });

  /**
   * Validates that initializing a repository configures local encryption flags correctly via isomorphic-git.
   */
  test("Should call git.init and set custom encrypted config flag", async () => {
    const manager = createCryptoGitContext(mockHttpClient);
    manager.addProfile(testProfile);

    await manager.init("secure-team-repo");

    expect(git.init).toHaveBeenCalledWith(
      expect.objectContaining({ dir: testProfile.dir, fs: expect.any(Object) })
    );
    expect(git.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: testProfile.dir,
        path: "core.encrypted",
        value: "true",
        fs: expect.any(Object)
      })
    );
  });

  /**
   * Confirms that clone method pipelines profiles metadata and fallback configurations correctly.
   */
  test("Should bridge repository metadata onto git.clone invocation", async () => {
    const manager = createCryptoGitContext(mockHttpClient);
    manager.addProfile(testProfile);

    await manager.clone("secure-team-repo", { depth: 1 });

    expect(git.clone).toHaveBeenCalledWith({
      fs: expect.any(Object),
      http: mockHttpClient,
      dir: testProfile.dir,
      url: testProfile.url,
      ref: testProfile.ref,
      depth: 1
    });
  });

  /**
   * Assures sync protocols like pulling and pushing inject intercepted filesystems correctly.
   */
  test("Should orchestrate git.pull and git.push synchronizations flawlessly", async () => {
    const manager = createCryptoGitContext(mockHttpClient);
    manager.addProfile(testProfile);

    await manager.pull("secure-team-repo");
    expect(git.pull).toHaveBeenCalledWith(
      expect.objectContaining({ dir: testProfile.dir, ref: "main", singleBranch: true })
    );

    await manager.push("secure-team-repo");
    expect(git.push).toHaveBeenCalledWith(
      expect.objectContaining({ dir: testProfile.dir, remote: "origin", ref: "main" })
    );
  });

  /**
   * Verifies that committing changes properly resolves and forwards custom author parameters.
   */
  test("Should invoke git.commit and pass down author signature information", async () => {
    const manager = createCryptoGitContext(mockHttpClient);
    manager.addProfile(testProfile);

    const author = { name: "Alice", email: "alice@crypto.org" };
    const sha = await manager.commit("secure-team-repo", "feat: secure commit", author);

    expect(sha).toBe("mock_commit_sha_12345");
    expect(git.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: testProfile.dir,
        message: "feat: secure commit",
        author
      })
    );
  });

  /**
   * Validates robust error routing if context looks up non-existent target profile references.
   */
  test("Should throw an informative error if a profile is completely missing", async () => {
    const manager = createCryptoGitContext(mockHttpClient);

    await expect(manager.init("unknown-profile"))
      .rejects
      .toThrow('Profile "unknown-profile" not found');
  });

  /**
   * Validates constructor exceptions if essential HTTP adapters are missing during startup.
   */
  test("Should throw error at context initialization if httpClient is absent", () => {
    expect(() => createCryptoGitContext(null))
      .toThrow("HTTP client adapter is required (isomorphic-git/http/node or /http/web)");
  });
});