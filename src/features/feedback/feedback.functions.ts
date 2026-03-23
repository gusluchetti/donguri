import { createServerFn } from "@tanstack/react-start";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { catalogEntries, users } from "~/db/schema";
import { requireAuth } from "~/features/auth/auth.session";
import { cleanEnv } from "~/lib/env";

export const FEEDBACK_TYPES = ["bug", "enhancement", "documentation", "question"] as const;

const TITLE_PREFIX: Record<(typeof FEEDBACK_TYPES)[number], string> = {
  bug: "[Bug]",
  enhancement: "[Enhancement]",
  documentation: "[Documentation]",
  question: "[Question]",
};

// In-memory rate limiting: 3 submissions per 15 min per user
const rateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 3;
const RATE_WINDOW = 15 * 60 * 1000;
const SWEEP_INTERVAL = 10 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;
function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimits) {
      if (now - entry.windowStart > RATE_WINDOW) rateLimits.delete(key);
    }
    if (rateLimits.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, SWEEP_INTERVAL);
  if (typeof sweepTimer === "object" && "unref" in sweepTimer) sweepTimer.unref();
}

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimits.set(userId, { count: 1, windowStart: now });
    ensureSweep();
    return;
  }

  if (entry.count >= RATE_LIMIT) {
    throw new Error("Too many submissions. Please wait a few minutes before trying again.");
  }

  entry.count++;
}

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      type: z.enum(FEEDBACK_TYPES),
      title: z.string().min(3).max(200),
      description: z.string().min(10).max(5000),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireAuth();

    checkRateLimit(session.userId);

    const db = getDb();

    const [[user], [{ total }]] = await Promise.all([
      db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1),
      db
        .select({ total: count() })
        .from(catalogEntries)
        .where(eq(catalogEntries.userId, session.userId)),
    ]);

    if (user?.createdAt) {
      const ageDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < 3) {
        const remaining = Math.ceil(3 - ageDays);
        throw new Error(
          `Your account must be at least 3 days old to submit feedback. ${remaining} day${remaining === 1 ? "" : "s"} remaining.`,
        );
      }
    }

    if (total === 0) {
      throw new Error(
        "You must have at least one item in your catalog before submitting feedback.",
      );
    }

    const token = cleanEnv(process.env.GITHUB_FEEDBACK_TOKEN);
    if (!token) throw new Error("Feedback is not configured on this server.");

    const prefix = TITLE_PREFIX[data.type];
    const authLabel =
      session.authMethod === "atproto"
        ? `@${session.handle}`
        : `${session.handle} (${session.authMethod})`;

    const body = `${data.description}\n\n---\n*Submitted via in-app feedback by ${authLabel}*`;

    const res = await fetch("https://api.github.com/repos/gusluchetti/donguri/issues", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `${prefix} ${data.title}`,
        body,
        labels: [data.type, "user-feedback"],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[feedback] GitHub API error:", res.status, text);
      throw new Error("Failed to submit feedback. Please try again later.");
    }

    return { ok: true };
  });
