import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./users";
import { currentMember, requireRole } from "./orgs";

/**
 * Invoice branding — logo and signature. Org-scoped as of Phase 0, so staff
 * share one set of branding rather than each carrying their own.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return null;

    return await ctx.db
      .query("settings")
      .withIndex("by_orgId", (q) => q.eq("orgId", member.orgId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    logo: v.optional(v.string()),
    signature: v.optional(
      v.object({
        name: v.string(),
        image: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_orgId", (q) => q.eq("orgId", member.orgId))
      .unique();

    const patch = {
      ...(args.logo && { invoiceLogo: args.logo }),
      ...(args.signature && { signature: args.signature }),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("settings", {
        orgId: member.orgId,
        // userId retained so the pre-Phase-0 public PDF fallback still resolves.
        userId: user._id,
        ...patch,
      });
    }

    return { message: "Setting updated successfully" };
  },
});
