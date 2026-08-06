import { describe, test, expect, vi, beforeEach } from "vitest";
import git from "isomorphic-git";
import { createCryptoGitContext } from "../src/index.js";
import { createSecureBuffer, importMasterKey } from "../src/core.js";

/**
 * Mock definition for the isomorphic-git core module.
 * Bridges interceptable spy utilities onto low-level repository state transitions.
 */
vi.mock("isomorphic-git", () => ({
  default: {
    init: vi.fn(),
    setConfig: vi.fn(),
    clone: vi.fn(),
    add: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    commit: vi.fn().mockResolvedValue("mock_commit_sha_12345"),
  }
}));

/**
 * Mock specification for isomorphic-git/http/node.
 */
vi.mock("isomorphic-git/http/node", () => ({
  default: { request: vi.fn() }
}));

/**
 * Mock specification for isomorphic-git/http/web.
 */
vi.mock("isomorphic-git/http/web", () => ({
  default: { request: vi.fn() }
}));

/**
 * Mock specification for @isomorphic-git/lightning-fs.
 */
vi.mock("@isomorphic-git/lightning-fs", () => {
  class MockLightningFS {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
  }
  return { default: MockLightningFS };
});

/**
 * Mock specification for the native Node.js ssh2 module.
 * Simulates low-level SSH channel handshakes, multiplexed terminal stream allocations,
 * and standard Smart-HTTP RPC command invocations to isolate network activities.
 */
vi.mock("ssh2", () => {
  /**
   * Mocked Duplex stream handling bidirectional git-upload-pack / git-receive-pack transfers.
   */
  const mockStream = {
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event, cb) => {
      if (event === "data") {
        setTimeout(() => cb(Buffer.from("")), 10);
      }
      if (event === "close") {
        setTimeout(cb, 20);
      }
      return mockStream;
    }),
    stderr: { on: vi.fn() }
  };

  /**
   * Mocked SSH2 client context facilitating connection handshakes and command executions.
   */
  const mockClient = {
    on: vi.fn((event, cb) => {
      if (event === "ready") setTimeout(cb, 10);
      return mockClient;
    }),
    exec: vi.fn((cmd, cb) => {
      cb(null, mockStream);
    }),
    connect: vi.fn(),
    end: vi.fn()
  };

  return {
    Client: vi.fn(() => mockClient)
  };
});

/**
 * Creates a mock Node.js HTTP client for RepoProfile tests.
 */
function createMockNodeHttp() {
  return { request: vi.fn().mockResolvedValue({ statusCode: 200, body: [], headers: {} }) };
}

/**
 * Creates a mock Browser HTTP client for BrowserRepoProfile tests.
 */
function createMockBrowserHttp() {
  return { request: vi.fn().mockResolvedValue({ statusCode: 200, body: [], headers: {} }) };
}

describe("CryptoGitContext Zero-Config Integration Tests", () => {
  let masterKey: CryptoKey;
  let mockNodeHttp: any;
  let mockBrowserHttp: any;
  let mockBaseFs: any;
  let testProfile: any;
  let testBrowserProfile: any;
  let testSshProfile: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const rawKey = createSecureBuffer(32);
    rawKey.set(new Array(32).fill(9));
    masterKey = await importMasterKey(rawKey);

    mockNodeHttp = createMockNodeHttp();
    mockBrowserHttp = createMockBrowserHttp();
    mockBaseFs = { writeFile: vi.fn(), readFile: vi.fn() };

    testProfile = {
      name: "secure-team-repo",
      url: "https://github.com",
      dir: "/path/to/secure-repo",
      ref: "main",
      remote: "origin",
      key: masterKey,
    };

    testBrowserProfile = {
      name: "secure-browser-vault",
      url: "https://github.com",
      dir: "/vault-project",
      ref: "main",
      key: masterKey,
      fs: mockBaseFs,
    };

    testSshProfile = {
      name: "secure-ssh-repo",
      url: "git@github.com:ASA-GH/secure-vault.git",
      dir: "/path/to/ssh-repo",
      ref: "main",
      remote: "origin",
      key: masterKey,
    };
  });

  /**
   * Assures that profile lifecycle management (adding, getting, and removing profiles) operates as expected.
   */
  test("Should properly manage repository profiles internally", () => {
    const manager = createCryptoGitContext();

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
    const manager = createCryptoGitContext();
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
    const manager = createCryptoGitContext();
    manager.addProfile(testProfile);

    await manager.clone("secure-team-repo", { depth: 1 });

    expect(git.clone).toHaveBeenCalledWith({
      fs: expect.any(Object),
      http: expect.any(Object),
      dir: testProfile.dir,
      url: testProfile.url,
      ref: testProfile.ref,
      depth: 1
    });
  });

  /**
   * Verifies that SSH profile automatically creates SSH transport without manual httpClient assignment.
   */
  test("Should auto-resolve SSH transport for SshRepoProfile without manual httpClient", async () => {
    const manager = createCryptoGitContext();
    manager.addProfile(testSshProfile);

    await manager.pull("secure-ssh-repo");

    expect(git.pull).toHaveBeenCalledWith(
      expect.objectContaining({
        http: expect.any(Object),
        dir: testSshProfile.dir
      })
    );
    expect(git.pull).not.toHaveBeenCalledWith(
      expect.objectContaining({
        http: mockNodeHttp
      })
    );
  });

  /**
   * Assures sync protocols like pulling and pushing inject intercepted filesystems correctly.
   */
  test("Should orchestrate git.pull and git.push synchronizations flawlessly", async () => {
    const manager = createCryptoGitContext();
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
    const manager = createCryptoGitContext();
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
    const manager = createCryptoGitContext();

    await expect(manager.init("unknown-profile"))
      .rejects
      .toThrow("Profile \"unknown-profile\" not found");
  });

  /**
   * Assures that staging files via add method supports both single string path and array lists.
   */
  test("Should bridge single string or multiple filepaths to git.add staging invocations", async () => {
    const manager = createCryptoGitContext();
    manager.addProfile(testProfile);

    await manager.add("secure-team-repo", "src/index.ts");
    expect(git.add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: testProfile.dir,
      filepath: "src/index.ts"
    });

    await manager.add("secure-team-repo", ["package.json", "README.md"]);
    expect(git.add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: testProfile.dir,
      filepath: "package.json"
    });
    expect(git.add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: testProfile.dir,
      filepath: "README.md"
    });
  });

  /**
   * Verifies that BrowserRepoProfile resolves with its profile-level fs client.
   */
  test("Should use BrowserRepoProfile fs when provided", async () => {
    const manager = createCryptoGitContext();
    manager.addProfile(testBrowserProfile);

    await manager.init("secure-browser-vault");

    expect(git.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: testBrowserProfile.dir,
        fs: expect.any(Object)
      })
    );
  });

  /**
   * Verifies that a mixed manager (Node + Browser + SSH) resolves each profile's stack independently.
   */
  test("Should resolve different httpClient/fs per profile in a mixed manager", async () => {
    const manager = createCryptoGitContext();
    manager.addProfile(testProfile);
    manager.addProfile(testBrowserProfile);
    manager.addProfile(testSshProfile);

    // Init Node profile
    await manager.init("secure-team-repo");
    const nodeFsCall = vi.mocked(git.init).mock.calls[0][0];

    // Init Browser profile
    await manager.init("secure-browser-vault");
    const browserFsCall = vi.mocked(git.init).mock.calls[1][0];

    // SSH profile uses different http (SSH transport)
    await manager.pull("secure-ssh-repo");
    const sshHttpCall = vi.mocked(git.pull).mock.calls[0][0];

    expect(nodeFsCall.fs).not.toEqual(browserFsCall.fs);
    expect(sshHttpCall.http).toBeDefined();
  });

});
