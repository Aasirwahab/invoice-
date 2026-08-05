import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex has no Date type, so all dates are stored as epoch milliseconds
 * (Date.now() / date.getTime()) and converted back with new Date(ms).
 *
 * Every table gets `_id` and `_creationTime` automatically, so the old
 * Mongoose `createdAt` field is not redeclared here.
 */

const partyFields = {
  name: v.string(),
  email: v.string(),
  address1: v.string(),
  address2: v.optional(v.string()),
  address3: v.optional(v.string()),
};

const itemFields = {
  item_name: v.string(),
  quantity: v.number(),
  price: v.number(),
  total: v.number(),
};

export default defineSchema({
  users: defineTable({
    // Clerk's user id — the link between Clerk identity and app data.
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    // unset until onboarding completes — this is what gates /onboarding
    currency: v.optional(v.string()),
  }).index("by_clerkId", ["clerkId"]),

  invoices: defineTable({
    userId: v.id("users"),
    invoice_no: v.string(),
    invoice_date: v.number(),
    due_date: v.number(),
    currency: v.string(),

    // from ( current user )
    from: v.object(partyFields),
    // to (client)
    to: v.object(partyFields),

    items: v.array(v.object(itemFields)),

    sub_total: v.number(),
    discount: v.optional(v.number()),
    tax_percentage: v.optional(v.number()),
    total: v.number(),
    notes: v.optional(v.string()),

    status: v.union(
      v.literal("PAID"),
      v.literal("UNPAID"),
      v.literal("CANCEL")
    ),
  }).index("by_userId", ["userId"]),

  settings: defineTable({
    userId: v.id("users"),
    invoiceLogo: v.optional(v.string()),
    signature: v.optional(
      v.object({
        name: v.string(),
        image: v.string(),
      })
    ),
  }).index("by_userId", ["userId"]),
});
