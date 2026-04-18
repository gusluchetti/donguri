import fs from "node:fs";
import { fetch } from "undici";

export async function downloadDump(url: string, targetPath: string): Promise<void> {
  const startTime = Date.now();

  console.log(`[download] Starting: ${url}`);
  console.log(`[download] Target: ${targetPath}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }

    const totalSize = Number.parseInt(response.headers.get("content-length") || "0", 10);
    const totalSizeGB = (totalSize / 1024 / 1024 / 1024).toFixed(1);

    console.log(`[download] Total size: ${totalSizeGB}GB`);

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
        const pct = ((downloaded / totalSize) * 100).toFixed(1);
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(0);
        const rate = (downloaded / 1024 / 1024 / ((now - startTime) / 1000)).toFixed(1);

        console.log(`[download] ${pct}% (${downloadedMB}MB / ${totalSizeGB}GB) @ ${rate}MB/s`);

        lastProgressTime = now;
      }
    }

    file.end();

    await new Promise<void>((resolve, reject) => {
      file.on("finish", () => resolve());
      file.on("error", reject);
    });

    fs.renameSync(tempPath, targetPath);

    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    const downloadedGB = (downloaded / 1024 / 1024 / 1024).toFixed(1);

    console.log(`[download] Completed in ${duration}s (${downloadedGB}GB)`);
  } catch (error) {
    const tempPath = `${targetPath}.partial`;
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    throw error;
  }
}
