import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { applyCatalogDefaults } from "./catalog";

/**
 * Phase 0 backfill: gives every pre-org user an organization, an OWNER
 * membership, and stamps their existing invoices and settings with orgId.
 *
 * internalMutation, not mutation — it cannot be reached from the browser, and
 * the public entry points it would otherwise need (requireRole OWNER) don't
 * work here because no member rows exist yet. Run it from the CLI:
 *
 *   pnpm dlx convex run migrations:backfillOrgs
 *
 * Idempotent: users who already have a membership are skipped, and documents
 * that already carry an orgId are left alone, so re-running is harmless.
 */
export const backfillOrgs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    let orgsCreated = 0;
    let invoicesStamped = 0;
    let settingsStamped = 0;

    for (const user of users) {
      const orgId = await ensureOrgFor(ctx, user);
      if (orgId.created) orgsCreated++;

      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      for (const invoice of invoices) {
        if (invoice.orgId) continue;
        await ctx.db.patch(invoice._id, { orgId: orgId.id });
        invoicesStamped++;
      }

      const settings = await ctx.db
        .query("settings")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      for (const setting of settings) {
        if (setting.orgId) continue;
        await ctx.db.patch(setting._id, { orgId: orgId.id });
        settingsStamped++;
      }
    }

    return {
      usersSeen: users.length,
      orgsCreated,
      invoicesStamped,
      settingsStamped,
    };
  },
});

async function ensureOrgFor(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<{ id: Id<"organizations">; created: boolean }> {
  const existing = await ctx.db
    .query("members")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", user.clerkId))
    .unique();

  if (existing) return { id: existing.orgId, created: false };

  // Name it after whatever we know — the owner renames it in settings.
  const owner = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const name = owner ? `${owner}'s Company` : user.email || "My Company";

  const orgId = await ctx.db.insert("organizations", {
    name,
    defaultCurrency: user.currency ?? "LKR",
    email: user.email,
  });

  await ctx.db.insert("members", {
    orgId,
    userId: user._id,
    clerkId: user.clerkId,
    email: user.email,
    role: "OWNER",
    status: "ACTIVE",
  });

  return { id: orgId, created: true };
}

/**
 * Seeds the default brands and categories into every organization that has
 * none. The same thing the "Add common brands" button does, but runnable
 * without a browser session:
 *
 *   pnpm dlx convex run migrations:seedCatalogDefaults
 *
 * Idempotent — existing names are skipped.
 */
export const seedCatalogDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();

    const results = [];
    for (const org of orgs) {
      const outcome = await applyCatalogDefaults(ctx, org._id);
      results.push({ org: org.name, ...outcome });
    }

    return results;
  },
});

/**
 * Verification helper — reports anything the backfill left behind. Expect all
 * zeros before tightening orgId to required in schema.ts.
 *
 *   pnpm dlx convex run migrations:checkBackfill
 */
export const checkBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db.query("invoices").collect();
    const settings = await ctx.db.query("settings").collect();
    const users = await ctx.db.query("users").collect();

    const memberships = await ctx.db.query("members").collect();
    const claimed = new Set(memberships.map((m) => m.clerkId));

    return {
      invoicesWithoutOrg: invoices.filter((d) => !d.orgId).length,
      settingsWithoutOrg: settings.filter((d) => !d.orgId).length,
      usersWithoutMembership: users.filter((u) => !claimed.has(u.clerkId))
        .length,
    };
  },
});
