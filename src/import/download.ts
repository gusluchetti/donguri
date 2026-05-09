import fs from "node:fs";
import { fetch } from "undici";

export async function downloadIfNeeded(
  url: string,
  targetPath: string,
  maxAgeDays: number,
  _label: string,
): Promise<void> {
  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < maxAgeDays) {
      return;
    }
  }
  await downloadDump(url, targetPath);
}

export async function downloadDump(url: string, targetPath: string): Promise<void> {
  const startTime = Date.now();

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }

    const totalSize = Number.parseInt(response.headers.get("content-length") || "0", 10);
    const _totalSizeGB = (totalSize / 1024 / 1024 / 1024).toFixed(1);

    const tempPath = `${targetPath}.partial`;
    const file = fs.createWriteStream(tempPath);

    let downloaded = 0;
    let lastProgressTime = Date.now();

    if (!response.body) {
      throw new Error("Response body is null");
    }

    for await (const chunk of response.body) {
      downloaded += chunk.length;
      file.write(chunk);

      const now = Date.now();

      if (totalSize > 0 && now - lastProgressTime > 5000) {
        const _pct = ((downloaded / totalSize) * 100).toFixed(1);
        const _downloadedMB = (downloaded / 1024 / 1024).toFixed(0);
        const _rate = (downloaded / 1024 / 1024 / ((now - startTime) / 1000)).toFixed(1);

        lastProgressTime = now;
      }
    }

    file.end();

    await new Promise<void>((resolve, reject) => {
      file.on("finish", () => resolve());
      file.on("error", reject);
    });

    fs.renameSync(tempPath, targetPath);

    const _duration = ((Date.now() - startTime) / 1000).toFixed(0);
    const _downloadedGB = (downloaded / 1024 / 1024 / 1024).toFixed(1);
  } catch (error) {
    const tempPath = `${targetPath}.partial`;
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    throw error;
  }
}
