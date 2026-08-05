import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentUser, requireUser } from "./users";

const partyValidator = v.object({
  name: v.string(),
  email: v.string(),
  address1: v.string(),
  address2: v.optional(v.string()),
  address3: v.optional(v.string()),
});

const itemValidator = v.object({
  item_name: v.string(),
  quantity: v.number(),
  price: v.number(),
  total: v.number(),
});

const statusValidator = v.union(
  v.literal("PAID"),
  v.literal("UNPAID"),
  v.literal("CANCEL")
);

const invoiceFields = {
  invoice_no: v.string(),
  invoice_date: v.number(),
  due_date: v.number(),
  currency: v.string(),
  from: partyValidator,
  to: partyValidator,
  items: v.array(itemValidator),
  sub_total: v.number(),
  discount: v.optional(v.number()),
  tax_percentage: v.optional(v.number()),
  total: v.number(),
  notes: v.optional(v.string()),
  status: statusValidator,
};

const PAGE_SIZE = 5;

/**
 * Page-numbered listing, matching the shape the old REST endpoint returned so
 * the existing pagination UI keeps working.
 *
 * Note: this reads the user's invoices and slices in memory. Fine at this
 * scale; switch to Convex's cursor pagination (.paginate) if the table grows.
 */
export const list = query({
  args: {
    page: v.optional(v.number()),
    invoiceId: v.optional(v.id("invoices")),
  },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) {
      return { data: [], totalCount: 0, totalPage: 0, page: 1 };
    }

    if (args.invoiceId) {
      const one = await ctx.db.get(args.invoiceId);
      const owned = one && one.userId === user._id ? [one] : [];
      return { data: owned, totalCount: owned.length, totalPage: 1, page: 1 };
    }

    const all = await ctx.db
      .query("invoices")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const page = args.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    return {
      data: all.slice(skip, skip + PAGE_SIZE),
      totalCount: all.length,
      totalPage: Math.ceil(all.length / PAGE_SIZE),
      page,
    };
  },
});

export const getById = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return null;

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.userId !== user._id) return null;

    return invoice;
  },
});

export const create = mutation({
  args: invoiceFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const invoiceId = await ctx.db.insert("invoices", {
      ...args,
      userId: user._id,
    });

    return { message: "Invoice created successfully", invoiceId };
  },
});

export const update = mutation({
  args: {
    invoiceId: v.id("invoices"),
    invoice_no: v.optional(v.string()),
    invoice_date: v.optional(v.number()),
    due_date: v.optional(v.number()),
    currency: v.optional(v.string()),
    from: v.optional(partyValidator),
    to: v.optional(partyValidator),
    items: v.optional(v.array(itemValidator)),
    sub_total: v.optional(v.number()),
    discount: v.optional(v.number()),
    tax_percentage: v.optional(v.number()),
    total: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const { invoiceId, ...rest } = args;
    const existing = await ctx.db.get(invoiceId);

    if (!existing || existing.userId !== user._id) {
      throw new Error("No invoice found");
    }

    // strip undefined so a partial update (e.g. status only) does not blank fields
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined)
    );

    await ctx.db.patch(invoiceId, patch);

    return { message: "Invoice updated successfully" };
  },
});

/**
 * Used by the public PDF route, which has no session — the invoice id acts as
 * the capability, exactly as it did with the old Mongo route.
 */
export const getPublic = query({
  args: { invoiceId: v.id("invoices"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.userId !== args.userId) return null;

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    return { invoice, settings };
  },
});
