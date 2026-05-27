import { Client } from "ssh2";
import { SshRepoProfile } from "../types.js";

/**
 * Parses classic Git SSH URLs into connection components.
 * Supports: git@github.com:username/repo.git or ssh://git@://github.com
 */
function parseGitSshUrl(url: string) {
  let cleanUrl = url.replace(/^ssh:\/\//, "");
  const match = cleanUrl.match(/^([^@]+@)?([^:]+):(.+)$/);
  if (!match) {
    throw new Error(`Invalid Git SSH URL format: ${url}`);
  }
  return {
    username: match[1] ? match[1].replace("@", "") : "git",
    host: match[2],
    repoPath: match[3],
  };
}

/**
 * Creates a specialized isomorphic-git HTTP client proxy that tunnels
 * all network payloads directly through a secure native SSH2 session.
 */
export function createSshHttpClient(profile: SshRepoProfile) {
  const { host, username, repoPath } = parseGitSshUrl(profile.url);

  return {
    async request({ url, method, headers, body }: any): Promise<any> {
      return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on("ready", () => {
          const isInfoRefs = url.includes("/info/refs");
          let command = "";

          if (isInfoRefs) {
            const service = new URL(url).searchParams.get("service"); // git-upload-pack | git-receive-pack
            if (!service) {
              conn.end();
              return reject(new Error("Missing service parameter in info/refs request"));
            }
            command = `${service} '${repoPath}'`;
          } else if (url.endsWith("/git-upload-pack")) {
            command = `git-upload-pack '${repoPath}'`;
          } else if (url.endsWith("/git-receive-pack")) {
            command = `git-receive-pack '${repoPath}'`;
          } else {
            conn.end();
            return reject(new Error(`Unsupported Git network endpoint: ${url}`));
          }

          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            let responseBuffer = Buffer.alloc(0);

            if (body) {
              if (typeof body.pipe === "function") {
                body.pipe(stream);
              } else {
                stream.write(Buffer.from(body));
                stream.end();
              }
            }

            stream.on("data", (chunk: Buffer) => {
              responseBuffer = Buffer.concat([responseBuffer, chunk]);
            });

            stream.on("close", () => {
              conn.end();

              resolve({
                url,
                method,
                statusCode: 200,
                statusMessage: "OK",
                headers: {
                  "content-type": isInfoRefs
                    ? `application/x-${new URL(url).searchParams.get("service")}-advertisement`
                    : `application/x-${url.split("/").pop()}-result`,
                },
                body: [responseBuffer],
              });
            });

            stream.stderr.on("data", (data) => {
              console.warn(`[Git SSH Remote]: ${data.toString().trim()}`);
            });
          });
        });

        conn.on("error", (err) => {
          reject(err);
        });

        conn.connect({
          host,
          port: profile.port ?? 22,
          username,
          privateKey: profile.privateKey,
          passphrase: profile.passphrase,
        });
      });
    },
  };
}
