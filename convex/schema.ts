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

export const ROLES = ["OWNER", "MANAGER", "SALES", "VIEWER"] as const;
const roleValidator = v.union(
  v.literal("OWNER"),
  v.literal("MANAGER"),
  v.literal("SALES"),
  v.literal("VIEWER")
);

export default defineSchema({
  users: defineTable({
    // Clerk's user id — the link between Clerk identity and app data.
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    // Legacy: superseded by organizations.defaultCurrency. Still written so
    // in-flight sessions and the public PDF route keep resolving during the
    // Phase 0 rollout; drop it once every org row is backfilled.
    currency: v.optional(v.string()),
  }).index("by_clerkId", ["clerkId"]),

  /**
   * The dealership itself. One row per deployment today, but everything is
   * keyed by orgId so a second company never means a schema change.
   */
  organizations: defineTable({
    name: v.string(),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    address1: v.optional(v.string()),
    address2: v.optional(v.string()),
    address3: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    defaultCurrency: v.string(),
    invoicePrefix: v.optional(v.string()),
  }),

  /**
   * Staff membership. `clerkId` is unset while an invite is outstanding — the
   * row is matched to the person by email the first time they sign in, which
   * is what lets the owner add staff without any Clerk dashboard work.
   */
  members: defineTable({
    orgId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    clerkId: v.optional(v.string()),
    email: v.string(),
    role: roleValidator,
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("INVITED"),
      v.literal("DISABLED")
    ),
    invitedBy: v.optional(v.id("members")),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_org", ["orgId"])
    .index("by_email", ["email"]),

  invoices: defineTable({
    // Optional only so existing rows survive the deploy that adds it. The
    // backfill in migrations.ts sets it, after which it becomes required.
    orgId: v.optional(v.id("organizations")),
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
  })
    .index("by_userId", ["userId"])
    .index("by_orgId", ["orgId"]),

  settings: defineTable({
    orgId: v.optional(v.id("organizations")),
    userId: v.id("users"),
    invoiceLogo: v.optional(v.string()),
    signature: v.optional(
      v.object({
        name: v.string(),
        image: v.string(),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_orgId", ["orgId"]),
});
