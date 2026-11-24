import type * as FSType from "fs";
import type * as PathType from "path";

// Use dynamic require to prevent Turbopack from crawling project root data directories
const fs: typeof FSType = typeof window === "undefined" ? eval("require")("node:fs") : ({} as any);
const path: typeof PathType = typeof window === "undefined" ? eval("require")("node:path") : ({} as any);
import { Client as SSHClient, SFTPWrapper } from "ssh2";
import { ingestZstFile, isVolumeIngested } from "./ingest";

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  password?: string | null;
  private_key?: string | null;
  key_passphrase?: string | null;
  remote_path: string;
  auto_sync?: boolean;
  sync_interval_minutes?: number;
  remove_source?: boolean;
  last_sync_time?: number | null;
  last_sync_status?: "success" | "failed" | null;
  last_sync_message?: string | null;
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(/*turbopackIgnore: true*/ p);
  } catch {
    return false;
  }
}

function getAppPath(...parts: string[]): string {
  const root = process.cwd();
  return [root, ...parts].join(path.sep);
}

function getRawArchiveDir(): string {
  const candidates = [
    process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "archive", "raw") : null,
    getAppPath("data", "archive", "raw"),
    getAppPath("..", "data", "archive", "raw"),
    "/app/data/archive/raw",
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (safeExists(path.dirname(c))) {
      if (!safeExists(c)) fs.mkdirSync(c, { recursive: true });
      return c;
    }
  }
  const fallback = getAppPath("data", "archive", "raw");
  if (!safeExists(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function loadServers(): ServerConfig[] {
  const candidates = [
    process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "config", "servers.json") : null,
    getAppPath("data", "config", "servers.json"),
    getAppPath("..", "data", "config", "servers.json"),
    "/app/data/config/servers.json",
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (safeExists(c)) {
      try {
        return JSON.parse(fs.readFileSync(c, "utf-8"));
      } catch {
        // ignore
      }
    }
  }
  return [];
}

export function saveServers(servers: ServerConfig[]): void {
  const target =
    (process.env.DATA_DIR && path.join(process.env.DATA_DIR, "config", "servers.json")) ||
    getAppPath("data", "config", "servers.json");

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(servers, null, 2), "utf-8");
}

export async function syncServer(server: ServerConfig): Promise<{ success: boolean; message: string; pulled: number; ingested: number }> {
  return new Promise((resolve) => {
    const conn = new SSHClient();
    const rawDir = getRawArchiveDir();

    let privateKeyContent: Buffer | undefined;
    if (server.auth_type === "key" && server.private_key) {
      if (server.private_key.startsWith("-----BEGIN") || server.private_key.includes("\n")) {
        privateKeyContent = Buffer.from(server.private_key);
      } else if (safeExists(server.private_key)) {
        privateKeyContent = fs.readFileSync(/*turbopackIgnore: true*/ server.private_key);
      } else {
        // Check ~/.ssh/id_ed25519 or /root/.ssh/id_ed25519
        const fallbackKey = path.join(/*turbopackIgnore: true*/ process.env.HOME || "/root", ".ssh", "id_ed25519");
        if (safeExists(fallbackKey)) {
          privateKeyContent = fs.readFileSync(/*turbopackIgnore: true*/ fallbackKey);
        }
      }
    }

    conn
      .on("ready", () => {
        conn.sftp(async (err, sftp: SFTPWrapper) => {
          if (err) {
            conn.end();
            return resolve({ success: false, message: `SFTP error: ${err.message}`, pulled: 0, ingested: 0 });
          }

          sftp.readdir(server.remote_path, async (readErr, list) => {
            if (readErr) {
              conn.end();
              return resolve({ success: false, message: `Readdir failed: ${readErr.message}`, pulled: 0, ingested: 0 });
            }

            const files = list.filter((item) => item.filename.endsWith(".jsonl.zst"));
            let pulled = 0;
            let ingested = 0;

            for (const file of files) {
              const remoteFile = path.posix.join(server.remote_path, file.filename);
              const localFile = path.join(/*turbopackIgnore: true*/ rawDir, file.filename);

              const alreadyIngested = await isVolumeIngested(file.filename);
              if (alreadyIngested && safeExists(localFile)) {
                continue;
              }

              // Download file
              await new Promise<void>((dlResolve, dlReject) => {
                sftp.fastGet(remoteFile, localFile, (getErr) => {
                  if (getErr) dlReject(getErr);
                  else dlResolve();
                });
              }).catch(() => null);

              if (safeExists(localFile)) {
                pulled++;
                const res = await ingestZstFile(localFile);
                ingested += res.count;

                if (server.remove_source) {
                  sftp.unlink(remoteFile, () => {});
                }
              }
            }

            conn.end();
            resolve({
              success: true,
              message: `Synced ${pulled} volumes, ingested ${ingested} records.`,
              pulled,
              ingested,
            });
          });
        });
      })
      .on("error", (sshErr) => {
        resolve({ success: false, message: `SSH Connection error: ${sshErr.message}`, pulled: 0, ingested: 0 });
      })
      .connect({
        host: server.host,
        port: server.port || 22,
        username: server.username || "root",
        password: server.password || undefined,
        privateKey: privateKeyContent,
        passphrase: server.key_passphrase || undefined,
        readyTimeout: 10000,
      });
  });
}
