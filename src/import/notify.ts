import { Resend } from "resend";
import { formatDuration } from "./_retry";
import type { AnimeOfflineStats } from "./anime-offline";
import { getConfig } from "./config";
import type { CoversStats } from "./covers";
import type { QrankStats } from "./qrank";

let client: Resend | null = null;

function getClient(): Resend | null {
  const config = getConfig();
  if (!config.resendApiKey || !config.emailFrom || !config.emailTo) return null;
  if (!client) {
    client = new Resend(config.resendApiKey);
  }
  return client;
}

export interface ImportReport {
  qrank?: QrankStats;
  animeOffline?: AnimeOfflineStats;
  covers?: CoversStats;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function buildSuccessBody(stage: string, durationMs: number, report?: ImportReport): string {
  const lines: string[] = [
    `Import pipeline stage "${stage}" completed in ${formatDuration(durationMs)}.`,
    "",
    `Timestamp: ${new Date().toISOString()}`,
  ];

  if (report) {
    if (report.qrank) {
      const q = report.qrank;
      lines.push(
        "",
        "── QRank ──────────────────────────────",
        `  Matched entries:  ${fmt(q.matched)}`,
        `  Records updated:  ${fmt(q.updated)}`,
        `  Duration:         ${formatDuration(q.durationMs)}`,
      );
    }

    if (report.animeOffline) {
      const a = report.animeOffline;
      lines.push(
        "",
        "── Anime Offline ───────────────────────",
        `  Records enriched: ${fmt(a.enriched)}`,
        `  Duration:         ${formatDuration(a.durationMs)}`,
      );
    }

    if (report.covers) {
      const c = report.covers;
      lines.push(
        "",
        "── Covers ──────────────────────────────",
        `  TMDB:             ${fmt(c.tmdb)}`,
        `  AniList:          ${fmt(c.anilist)}`,
        `  IGDB:             ${fmt(c.igdb)}`,
        `  Total updated:    ${fmt(c.updated)}`,
        `  Duration:         ${formatDuration(c.durationMs)}`,
      );
    }
  }

  return lines.join("\n");
}

export async function notifySuccess(
  stage: string,
  durationMs: number,
  report?: ImportReport,
): Promise<void> {
  const config = getConfig();
  const client = getClient();
  if (!client || !config.emailOnSuccess) return;

  const subject = `[donguri] Import completed (${stage})`;
  const body = buildSuccessBody(stage, durationMs, report);

  try {
    await client.emails.send({
      from: config.emailFrom,
      to: config.emailTo,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("[notify] Failed to send success email:", err);
  }
}

export async function notifyFailure(error: unknown): Promise<void> {
  const config = getConfig();
  const client = getClient();
  if (!client || !config.emailOnFailure) return;

  const errorString = error instanceof Error ? error.stack || error.message : String(error);
  const subject = "[donguri] Import FAILED";

  const body = `Import pipeline failed.

Timestamp: ${new Date().toISOString()}
Error:
${errorString}`;

  try {
    await client.emails.send({
      from: config.emailFrom,
      to: config.emailTo,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("[notify] Failed to send failure email:", err);
  }
}

export async function notifyWarning(message: string, error: unknown): Promise<void> {
  const config = getConfig();
  const client = getClient();
  if (!client || !config.emailOnWarning) return;

  const errorString = error instanceof Error ? error.stack || error.message : String(error);
  const subject = "[donguri] Import warning";

  const body = `Import pipeline succeeded overall, but a supplementary step triggered a warning.

Timestamp: ${new Date().toISOString()}
Warning: ${message}
Error:
${errorString}`;

  try {
    await client.emails.send({
      from: config.emailFrom,
      to: config.emailTo,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("[notify] Failed to send warning email:", err);
  }
}
