import fs from "node:fs";
import { fetch } from "undici";
import { log } from "~/lib/logger";

export async function downloadIfNeeded(
  url: string,
  targetPath: string,
  maxAgeDays: number,
  label: string,
): Promise<void> {
  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < maxAgeDays) {
      log.info(
        "download",
        `file exists and is fresh: path=${targetPath} age=${ageDays.toFixed(1)}d < ${maxAgeDays}d label=${label} size=${(stats.size / 1024 / 1024 / 1024).toFixed(2)}GB`,
      );
      return;
    }
    log.info(
      "download",
      `file exists but stale: path=${targetPath} age=${ageDays.toFixed(1)}d >= ${maxAgeDays}d label=${label}, will re-download`,
    );
  } else {
    log.info("download", `file does not exist: path=${targetPath} label=${label}, will download`);
  }
  await downloadDump(url, targetPath);
}

export async function downloadDump(url: string, targetPath: string): Promise<void> {
  return log
    .step("download", "downloadDump", async () => {
      const startTime = Date.now();

      log.info("download", `starting download: url=${url} target=${targetPath}`);

      const response = await fetch(url, { redirect: "follow" });

      if (!response.ok) {
        const statusText = response.statusText;
        const headers = Object.fromEntries(response.headers.entries());
        log.error("download", `HTTP error: status=${response.status} statusText=${statusText}`, {
          url,
          headers: Object.keys(headers)
            .filter((k) => !k.toLowerCase().includes("authorization"))
            .reduce(
              (obj, k) => {
                obj[k] = headers[k];
                return obj;
              },
              {} as Record<string, string>,
            ),
        });
        throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
      }

      const totalSize = Number.parseInt(response.headers.get("content-length") || "0", 10);
      const totalSizeGB = (totalSize / 1024 / 1024 / 1024).toFixed(1);
      const contentType = response.headers.get("content-type") || "unknown";
      const finalUrl = response.url || url;

      log.info(
        "download",
        `response headers: content-length=${totalSize} content-type=${contentType} final-url=${finalUrl}`,
      );
      log.info("download", `starting download, total ${totalSizeGB} GB`);

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
          const elapsed = ((now - startTime) / 1000).toFixed(0);
          const remainingBytes = totalSize - downloaded;
          const remainingTime = remainingBytes / (downloaded / ((now - startTime) / 1000));
          const remainingFormatted =
            remainingTime > 0 ? `${(remainingTime / 60).toFixed(0)}m` : "0m";

          log.info(
            "download",
            `progress: ${pct}% (${downloadedMB} MB) @ ${rate} MB/s elapsed=${elapsed}s eta=${remainingFormatted}`,
          );

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
      const avgRate = (downloaded / 1024 / 1024 / (Number(duration) || 1)).toFixed(1);

      log.info(
        "download",
        `download completed: duration=${duration}s size=${downloadedGB}GB avg_rate=${avgRate}MB/s path=${targetPath}`,
      );
    })
    .catch((err) => {
      const tempPath = `${targetPath}.partial`;
      if (fs.existsSync(tempPath)) {
        const partialSize = fs.statSync(tempPath).size;
        log.warn(
          "download",
          `cleaning up partial download: size=${(partialSize / 1024 / 1024).toFixed(2)}MB path=${tempPath}`,
        );
        fs.unlinkSync(tempPath);
      }
      throw err;
    });
}
