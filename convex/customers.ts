import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentMember, requireRole } from "./orgs";

/**
 * Dealer accounts and the price tiers that decide what they pay.
 *
 * A tier is a percentage off the product's wholesale price rather than a
 * per-product price list: adding "Distributor — 5% off" prices the entire
 * catalog for that dealer without touching a single product row.
 */

const DEFAULT_TIERS = [
  { name: "Wholesale", discountPercent: 0 },
  { name: "Distributor", discountPercent: 5 },
  { name: "Key Account", discountPercent: 10 },
];

/* ----------------------------------------------------------- price tiers */

export const listTiers = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];

    return await ctx.db
      .query("priceTiers")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();
  },
});

export const createTier = mutation({
  args: { name: v.string(), discountPercent: v.number() },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const name = args.name.trim();

    if (!name) throw new Error("Tier name is required");
    assertDiscount(args.discountPercent);

    const clash = await ctx.db
      .query("priceTiers")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .filter((q) => q.eq(q.field("name"), name))
      .first();

    if (clash) throw new Error(`Tier "${name}" already exists`);

    const tierId = await ctx.db.insert("priceTiers", {
      orgId: member.orgId,
      name,
      discountPercent: args.discountPercent,
    });

    return { tierId, message: "Price tier created" };
  },
});

export const updateTier = mutation({
  args: {
    tierId: v.id("priceTiers"),
    name: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const { tierId, ...rest } = args;

    const existing = await ctx.db.get(tierId);
    if (!existing || existing.orgId !== member.orgId) {
      throw new Error("No price tier found");
    }

    if (rest.discountPercent !== undefined) {
      assertDiscount(rest.discountPercent);
    }

    await ctx.db.patch(
      tierId,
      Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
      )
    );

    return { message: "Price tier updated" };
  },
});

/** Adds the standard tiers if none exist yet. Safe to re-run. */
export const seedTiers = mutation({
  args: {},
  handler: async (ctx) => {
    const member = await requireRole(ctx, "MANAGER");
    return await applyDefaultTiers(ctx, member.orgId);
  },
});

export async function applyDefaultTiers(
  ctx: MutationCtx,
  orgId: Id<"organizations">
) {
  const existing = await ctx.db
    .query("priceTiers")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();

  const have = new Set(existing.map((t) => t.name.trim().toLowerCase()));

  let added = 0;
  for (const tier of DEFAULT_TIERS) {
    if (have.has(tier.name.toLowerCase())) continue;
    await ctx.db.insert("priceTiers", { orgId, ...tier });
    added++;
  }

  return { added, message: `Added ${added} price tiers` };
}

/* ------------------------------------------------------------- customers */

/**
 * Full customer list with the tier resolved, so the invoice form can price a
 * line the moment a dealer is picked without a second round trip.
 */
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await currentMember(ctx);
    if (!member) return [];

    const term = args.search?.trim();

    const rows = term
      ? await ctx.db
          .query("customers")
          .withSearchIndex("search_business", (q) =>
            q.search("businessName", term).eq("orgId", member.orgId)
          )
          .take(50)
      : await ctx.db
          .query("customers")
          .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
          .collect();

    const tiers = await ctx.db
      .query("priceTiers")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();

    return rows.map((customer) => ({
      ...customer,
      tier: tiers.find((t) => t._id === customer.tierId) ?? null,
    }));
  },
});

const customerFields = {
  businessName: v.string(),
  contactName: v.optional(v.string()),
  email: v.string(),
  phone: v.optional(v.string()),
  address1: v.string(),
  address2: v.optional(v.string()),
  address3: v.optional(v.string()),
  taxId: v.optional(v.string()),
  tierId: v.optional(v.id("priceTiers")),
  creditLimit: v.optional(v.number()),
  paymentTermsDays: v.optional(v.number()),
};

export const create = mutation({
  args: customerFields,
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "SALES");

    if (!args.businessName.trim()) {
      throw new Error("Business name is required");
    }

    const customerId = await ctx.db.insert("customers", {
      ...args,
      businessName: args.businessName.trim(),
      orgId: member.orgId,
      status: "ACTIVE",
    });

    return { customerId, message: "Customer created" };
  },
});

export const update = mutation({
  args: {
    customerId: v.id("customers"),
    businessName: v.optional(v.string()),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address1: v.optional(v.string()),
    address2: v.optional(v.string()),
    address3: v.optional(v.string()),
    taxId: v.optional(v.string()),
    tierId: v.optional(v.id("priceTiers")),
    creditLimit: v.optional(v.number()),
    paymentTermsDays: v.optional(v.number()),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("INACTIVE"))),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "SALES");
    const { customerId, ...rest } = args;

    const existing = await ctx.db.get(customerId);
    if (!existing || existing.orgId !== member.orgId) {
      throw new Error("No customer found");
    }

    await ctx.db.patch(
      customerId,
      Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
      )
    );

    return { message: "Customer updated" };
  },
});

function assertDiscount(percent: number) {
  if (percent < 0 || percent >= 100) {
    throw new Error("Discount must be between 0 and 99");
  }
}
