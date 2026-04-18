import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetch } from "undici";
import { getConfig } from "./config";

interface RpcResponse {
  id: string;
  jsonrpc: string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface DownloadProgress {
  gid: string;
  totalLength: number;
  completedLength: number;
  downloadSpeed: number;
  errorCode: number;
}

interface Aria2File {
  path: string;
  selected: string;
}

interface Aria2FileInfo {
  completedLength: number;
  errorCode: number;
  files: Aria2File[];
  gid: string;
  totalLength: number;
}

export class Aria2Streamer {
  private rpcSecret: string;
  private rpcPort: number;
  private tempDir: string;

  constructor() {
    const config = getConfig();
    this.rpcSecret = crypto.randomUUID().slice(0, 16);
    this.rpcPort = 6800;
    this.tempDir = path.join(config.dataDir, "dl");
    fs.mkdirSync(this.tempDir, { recursive: true });

    this.startAria2c();
  }

  private startAria2c(): void {
    const args = [
      "--enable-rpc=true",
      `--rpc-listen-port=${this.rpcPort}`,
      `--rpc-secret=${this.rpcSecret}`,
      `--dir=${this.tempDir}`,
      "--continue=true",
      "--split=32",
      "-s 32",
      "--min-split-size=20M",
      "--stream-piece-selector=geom",
      "--max-file-not-found=3",
    ];

    const child = spawn("aria2c", args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    child.on("error", (err) => {
      throw new Error(`Failed to start aria2c: ${err.message}`);
    });
  }

  private async rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
    const response = await fetch(`http://127.0.0.1:${this.rpcPort}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params: [`token:${this.rpcSecret}`, ...params],
      }),
    });

    const data = (await response.json()) as RpcResponse;
    if (data.error) {
      throw new Error(`aria2c RPC error: ${data.error.message}`);
    }
    return data.result;
  }

  async downloadDump(url: string): Promise<string> {
    const gid = (await this.rpcCall("aria2.addUri", [[url]])) as string;
    const files = await this.waitForDownload(gid);
    return files[0].path;
  }

  async waitForDownload(gid: string): Promise<Aria2File[]> {
    while (true) {
      const status = (await this.rpcCall("aria2.tellStatus", [gid])) as DownloadProgress;

      if (status.totalLength > 0) {
        const pct = (status.completedLength / status.totalLength) * 100;
        const rate = (status.downloadSpeed / 1024 / 1024).toFixed(1);
        process.stderr.write(`[aria2] ${pct.toFixed(1)}% (${rate} MB/s)\n`);
      }

      if (status.errorCode !== 0 && status.totalLength > 0) {
        throw new Error(`aria2c download failed with code ${status.errorCode}`);
      }

      if (status.completedLength === status.totalLength && status.totalLength > 0) {
        const info = (await this.rpcCall("aria2.getFiles", [gid])) as Aria2FileInfo;
        return info.files;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async streamToSubset(dumpPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const lbzip2 = spawn("lbzip2", ["-dc", dumpPath]);
      const subset = spawn("bun", ["run", "src/import/subset.ts"], {
        cwd: path.dirname(dumpPath),
      });

      lbzip2.stdout.pipe(subset.stdin);

      lbzip2.stderr.on("data", (data) => {
        process.stderr.write(data);
      });

      subset.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`subset.ts exited with code ${code}`));
        }
      });

      lbzip2.on("error", (err) => {
        console.error("[error] Failed to run lbzip2:", err.message);
        if (err.message.includes("Executable not found") || err.message.includes("ENOENT")) {
          console.error("[error] Please install lbzip2: sudo apt install lbzip2");
        }
        reject(new Error(`lbzip2 failed: ${err.message}`));
      });
      subset.on("error", (err) => reject(new Error(`subset.ts failed: ${err.message}`)));
    });
  }

  async shutdown(): Promise<void> {
    await this.rpcCall("aria2.shutdown").catch(() => {});
  }
}
