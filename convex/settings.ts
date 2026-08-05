import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentUser, requireUser } from "./users";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;

    return await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

/** Create-or-update, mirroring the old POST /api/settings behaviour. */
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
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const patch = {
      ...(args.logo && { invoiceLogo: args.logo }),
      ...(args.signature && { signature: args.signature }),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("settings", { userId: user._id, ...patch });
    }

    return { message: "Setting updated successfully" };
  },
});
