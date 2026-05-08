import { Resend } from "resend";
import { formatDuration } from "./_retry";
import { getConfig } from "./config";

let client: Resend | null = null;

function getClient(): Resend | null {
  const config = getConfig();
  if (!config.resendApiKey) return null;
  if (!client) {
    client = new Resend(config.resendApiKey);
  }
  return client;
}

export async function notifySuccess(stage: string, durationMs: number): Promise<void> {
  const config = getConfig();
  const client = getClient();
  if (!client || !config.emailOnSuccess) return;

  const duration = formatDuration(durationMs);
  const subject = `[donguri] Import completed (${stage})`;

  const body = `Import pipeline stage "${stage}" completed in ${duration}.

Data source: Wikidata (full dump + RecentChanges).
Timestamp: ${new Date().toISOString()}`;

  try {
    await client.emails.send({
      from: config.emailFrom,
      to: config.emailTo,
      subject,
      text: body,
    });
    console.log("[notify] Success email sent");
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
    console.log("[notify] Failure email sent");
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
    console.log("[notify] Warning email sent");
  } catch (err) {
    console.error("[notify] Failed to send warning email:", err);
  }
}
