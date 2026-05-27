import { describe, test, expect, vi, beforeEach } from "vitest";
import { Client } from "ssh2";
import { createSshHttpClient } from "../src/transport/ssh.js";
import { SshRepoProfile } from "../src/types.js";

/**
 * Mock specification for the native Node.js ssh2 module.
 * Simulates low-level cryptographic handshakes, multichannel connection state transitions,
 * and remote execution pipelines to fully isolate network-dependent operations.
 */
vi.mock("ssh2", () => {
  /**
   * Mocked Duplex stream handler mimicking the raw bidirectional standard I/O byte transfers
   * produced by downstream remote git-upload-pack and git-receive-pack binaries.
   */
  class MockStream {
    public write = vi.fn();
    public stderr = {
      on: vi.fn(),
    };
    private _dataCb: ((chunk: Buffer) => void) | null = null;
    private _closeCb: (() => void) | null = null;
    private _dataSent = false;

    public end = vi.fn(() => {
      setImmediate(() => {
        if (this._closeCb) this._closeCb();
      });
    });

    public on(event: string, callback: (...args: any[]) => void): this {
      if (event === "data") {
        this._dataCb = callback as (chunk: Buffer) => void;
        setTimeout(() => {
          if (this._dataCb && !this._dataSent) {
            this._dataSent = true;
            this._dataCb(Buffer.from("mock-git-binary-payload"));
            setTimeout(() => {
              if (this._closeCb) this._closeCb();
            }, 10);
          }
        }, 5);
      } else if (event === "close") {
        this._closeCb = callback as () => void;
      }
      return this;
    }
  }

  /**
   * Mocked SSH2 execution context implementing connection initialization life-cycles,
   * authentication handshakes, and remote shell channel spawning constraints.
   */
  class MockClient {
    public connect = vi.fn();
    public end = vi.fn();

    public on = vi.fn((event: string, cb: (...args: any[]) => void) => {
      if (event === "ready") {
        setTimeout(() => cb(), 5);
      }
      return this;
    });

    public exec = vi.fn((command: string, cb: (err: Error | null, stream: MockStream) => void) => {
      const stream = new MockStream();
      cb(null, stream);
    });
  }

  return {
    /**
     * Standard function declaration acting as a proper constructor
     * allowing the downstream code to evaluate `new Client()`.
     */
    Client: vi.fn(function () {
      return new MockClient();
    }),
  };
});

describe("SSH Native Transport Layer Tests", () => {
  let mockProfile: SshRepoProfile;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile = {
      name: "test-ssh-vault",
      url: "git@github.com:ASA-GH/secure-obsidian-vault.git",
      dir: "/mock/dir",
      key: {} as CryptoKey,
      privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nMOCK...",
      ref: "main",
    };
  });

  /**
   * Validates that the internal parser correctly extracts connection
   * configurations from valid SCP‑style SSH URLs.
   */
  test("Should parse standard scp-like Git SSH URLs and establish accurate SSH settings", async () => {
    const httpClient = createSshHttpClient(mockProfile);

    await httpClient.request({
      url: "https://localhost/info/refs?service=git-upload-pack",
      method: "GET",
    });

    const mockClientInstance = vi.mocked(Client).mock.results[0]?.value;
    expect(mockClientInstance.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "github.com",
        username: "git",
        privateKey: mockProfile.privateKey,
        port: 22,
      })
    );
  });

  /**
   * Assures that the parser handles alternative `ssh://` protocol prefixes
   * and respects a custom port number.
   */
  test("Should support alternative ssh:// protocol URL string structures seamlessly", async () => {
    mockProfile.url = "ssh://git@github.com:ASA-GH/secure-obsidian-vault.git";
    mockProfile.port = 2222;

    const httpClient = createSshHttpClient(mockProfile);

    await httpClient.request({
      url: "https://localhost/info/refs?service=git-upload-pack",
      method: "GET",
    });

    const mockClientInstance = vi.mocked(Client).mock.results[0]?.value;
    expect(mockClientInstance.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "github.com",
        username: "git",
        port: 2222,
      })
    );
  });

  /**
   * Verifies that a completely invalid Git SSH URL causes an immediate
   * and descriptive runtime error.
   */
  test("Should throw an informative format exception if Git SSH URL cannot be fully parsed", () => {
    mockProfile.url = "invalid-url-format";

    expect(() => createSshHttpClient(mockProfile)).toThrow(
      "Invalid Git SSH URL format: invalid-url-format"
    );
  });

  /**
   * Confirms that the `info/refs` discovery request (the smart HTTP
   * protocol) is correctly translated into a `git-upload-pack` command
   * executed on the remote host, and that the response is wrapped into
   * an HTTP‑like object.
   */
  test("Should translate isomorphic-git info/refs discovery request into native SSH execution parameters", async () => {
    const httpClient = createSshHttpClient(mockProfile);

    const response = await httpClient.request({
      url: "https://localhost/info/refs?service=git-upload-pack",
      method: "GET",
    });

    const mockClientInstance = vi.mocked(Client).mock.results[0]?.value;
    expect(mockClientInstance.exec).toHaveBeenCalledWith(
      "git-upload-pack 'ASA-GH/secure-obsidian-vault.git'",
      expect.any(Function)
    );

    expect(response).toMatchObject({
      url: "https://localhost/info/refs?service=git-upload-pack",
      method: "GET",
      statusCode: 200,
      statusMessage: "OK",
      headers: {
        "content-type": "application/x-git-upload-pack-advertisement",
      },
    });
    expect(response.body[0]).toBeInstanceOf(Buffer);
    expect(response.body[0].toString()).toBe("mock-git-binary-payload");
  });

  /**
   * Ensures that a POST request to `/git-upload-pack` (the packfile
   * transfer endpoint) properly forwards the request body and returns
   * the correct content‑type header.
   */
  test("Should forward payload objects and map content types correctly during packfile fetch transactions", async () => {
    const httpClient = createSshHttpClient(mockProfile);
    const mockBodyPayload = Buffer.from("isomorphic-git-smart-packfile-request");

    const response = await httpClient.request({
      url: "https://localhost/git-upload-pack",
      method: "POST",
      body: mockBodyPayload,
    });

    const mockClientInstance = vi.mocked(Client).mock.results[0]?.value;
    expect(mockClientInstance.exec).toHaveBeenCalledWith(
      "git-upload-pack 'ASA-GH/secure-obsidian-vault.git'",
      expect.any(Function)
    );

    expect(response.headers["content-type"]).toBe("application/x-git-upload-pack-result");
  });

  /**
   * Checks that the implementation rejects the request if the mandatory
   * `service` query parameter is missing from an `/info/refs` discovery call.
   */
  test("Should reject execution workflows if service metadata query parameters are missing inside info/refs requests", async () => {
    const httpClient = createSshHttpClient(mockProfile);

    await expect(
      httpClient.request({
        url: "https://localhost/info/refs",
        method: "GET",
      })
    ).rejects.toThrow("Missing service parameter in info/refs request");
  });

  /**
   * Verifies that any Git endpoint other than the three known ones
   * (`/info/refs`, `/git-upload-pack`, `/git-receive-pack`) leads to
   * a fast rejection.
   */
  test("Should block execution context if unsupported Git network paths are targeted", async () => {
    const httpClient = createSshHttpClient(mockProfile);

    await expect(
      httpClient.request({
        url: "https://localhost/unsupported-git-endpoint",
        method: "GET",
      })
    ).rejects.toThrow("Unsupported Git network endpoint: https://localhost/unsupported-git-endpoint");
  });

  /**
   * Validates that the SSH connection is properly closed after every request.
   */
  test("Should gracefully close the SSH session after the request finishes", async () => {
    const httpClient = createSshHttpClient(mockProfile);

    await httpClient.request({
      url: "https://localhost/info/refs?service=git-upload-pack",
      method: "GET",
    });

    const mockClientInstance = vi.mocked(Client).mock.results[0]?.value;
    expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
  });
});