import { eq, or } from "drizzle-orm";
import { getDb } from "~/db";
import { subscriptions, users } from "~/db/schema";

const PROVIDER = "comped";
const db = getDb();

async function findUser(identifier: string) {
  const [user] = await db
    .select({ id: users.id, handle: users.handle, email: users.email, subscriptionId: users.subscriptionId })
    .from(users)
    .where(or(eq(users.handle, identifier), eq(users.email, identifier)))
    .limit(1);
  return user ?? null;
}

async function grant(identifier: string) {
  const user = await findUser(identifier);
  if (!user) {
    console.error(`No user found for "${identifier}"`);
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (existing) {
    if (existing.provider === PROVIDER) {
      console.log(`${user.handle} already has a comped subscription.`);
      return;
    }
    console.error(`${user.handle} already has a paid subscription (provider: ${existing.provider}). Not overwriting.`);
    process.exit(1);
  }

  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId: user.id,
      tier: "ranger_pass",
      status: "lifetime",
      plan: "lifetime",
      provider: PROVIDER,
    })
    .returning({ id: subscriptions.id });

  await db.update(users).set({ subscriptionId: sub.id }).where(eq(users.id, user.id));

  console.log(`Granted Ranger Pass (lifetime, comped) to ${user.handle}`);
  console.log("They need to log out and back in for the tier to take effect.");
}

async function revoke(identifier: string) {
  const user = await findUser(identifier);
  if (!user) {
    console.error(`No user found for "${identifier}"`);
    process.exit(1);
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (!sub) {
    console.log(`${user.handle} has no subscription.`);
    return;
  }
  if (sub.provider !== PROVIDER) {
    console.error(`${user.handle} has a paid subscription (provider: ${sub.provider}). Use Lemon Squeezy to manage it.`);
    process.exit(1);
  }

  await db.update(users).set({ subscriptionId: null }).where(eq(users.id, user.id));
  await db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
  console.log(`Revoked comped subscription for ${user.handle}`);
}

async function list() {
  const rows = await db
    .select({ handle: users.handle, email: users.email, createdAt: subscriptions.createdAt })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(eq(subscriptions.provider, PROVIDER));

  if (rows.length === 0) {
    console.log("No comped subscriptions.");
    return;
  }

  console.log(`Comped subscriptions (${rows.length}):\n`);
  for (const row of rows) {
    const date = row.createdAt ? row.createdAt.toISOString().slice(0, 10) : "?";
    console.log(`  ${row.handle}  ${row.email ?? ""}  (since ${date})`);
  }
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "grant": {
    if (!args[0]) {
      console.error("Usage: bun run comp grant <handle-or-email>");
      process.exit(1);
    }
    await grant(args[0]);
    break;
  }
  case "revoke": {
    if (!args[0]) {
      console.error("Usage: bun run comp revoke <handle-or-email>");
      process.exit(1);
    }
    await revoke(args[0]);
    break;
  }
  case "list": {
    await list();
    break;
  }
  default: {
    console.log("Usage: bun run comp <grant|revoke|list> [handle-or-email]");
    process.exit(1);
  }
}

process.exit(0);
