import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Resolves the Clerk identity on the request to this app's user row.
 * Returns null when signed out, or when signed in but not yet stored
 * (which only happens before `store` has run once).
 */
export async function currentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/** Same, but throws — for mutations that must not run anonymously. */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Unauthorized access");
  return user;
}

export const current = query({
  args: {},
  handler: async (ctx) => await currentUser(ctx),
});

/**
 * Creates the app-side row for the signed-in Clerk user, or refreshes the
 * name/email if Clerk's copy has changed. Safe to call on every page load.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized access");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const email = identity.email ?? "";
    const firstName = identity.givenName ?? undefined;
    const lastName = identity.familyName ?? undefined;

    if (existing) {
      // keep the local copy in step with Clerk without clobbering currency
      if (
        existing.email !== email ||
        existing.firstName !== firstName ||
        existing.lastName !== lastName
      ) {
        await ctx.db.patch(existing._id, { email, firstName, lastName });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      firstName,
      lastName,
    });
  },
});

/** Onboarding and the profile dialog both write through here. */
export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    await ctx.db.patch(user._id, {
      ...(args.firstName !== undefined && { firstName: args.firstName }),
      ...(args.lastName !== undefined && { lastName: args.lastName }),
      ...(args.currency !== undefined && { currency: args.currency }),
    });

    return { message: "User updated successfully" };
  },
});
