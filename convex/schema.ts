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
  // Set when the line came from the catalog. Optional because older invoices
  // predate the catalog and their lines were free text.
  productId: v.optional(v.id("products")),
  sku: v.optional(v.string()),
};

export const ROLES = ["OWNER", "MANAGER", "SALES", "VIEWER"] as const;
const roleValidator = v.union(
  v.literal("OWNER"),
  v.literal("MANAGER"),
  v.literal("SALES"),
  v.literal("VIEWER")
);

export const CATEGORY_KINDS = [
  "WATCH",
  "STRAP",
  "BATTERY",
  "BOX",
  "TOOL",
  "OTHER",
] as const;

const categoryKindValidator = v.union(
  v.literal("WATCH"),
  v.literal("STRAP"),
  v.literal("BATTERY"),
  v.literal("BOX"),
  v.literal("TOOL"),
  v.literal("OTHER")
);

/**
 * Category-specific product attributes, discriminated on `kind`. A strap has a
 * lug width and a watch has a movement; forcing both into one flat bag makes
 * every field optional and every filter a guess.
 */
const productAttrsValidator = v.union(
  v.object({
    kind: v.literal("WATCH"),
    caseSizeMm: v.optional(v.number()),
    movement: v.optional(
      v.union(
        v.literal("AUTOMATIC"),
        v.literal("QUARTZ"),
        v.literal("MANUAL"),
        v.literal("SOLAR"),
        v.literal("KINETIC")
      )
    ),
    dialColour: v.optional(v.string()),
    caseMaterial: v.optional(v.string()),
    waterResistanceM: v.optional(v.number()),
    warrantyMonths: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("STRAP"),
    lugWidthMm: v.optional(v.number()),
    material: v.optional(v.string()),
    colour: v.optional(v.string()),
    lengthMm: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("BATTERY"),
    cellCode: v.optional(v.string()),
    voltage: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("GENERIC"),
  })
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

  brands: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    logo: v.optional(v.id("_storage")),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
  }).index("by_org", ["orgId"]),

  categories: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    kind: categoryKindValidator,
  }).index("by_org", ["orgId"]),

  /**
   * One row per sellable SKU. Dial/colour variants of the same reference get
   * their own SKU rather than a variant table — wholesale pricing is per-SKU
   * anyway, so a variant layer would buy nothing.
   *
   * Images are Convex storage ids, not base64. A watch catalog carries real
   * photographs, and inlining them would blow the 1MB document limit and make
   * every list query ship the whole image set.
   */
  products: defineTable({
    orgId: v.id("organizations"),
    sku: v.string(),
    name: v.string(),
    brandId: v.optional(v.id("brands")),
    categoryId: v.optional(v.id("categories")),
    reference: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.optional(v.array(v.id("_storage"))),

    costPrice: v.number(),
    wholesalePrice: v.number(),
    msrp: v.optional(v.number()),

    // SERIAL products are counted piece by piece in Phase 3; QUANTITY products
    // carry a single on-hand number.
    trackingMode: v.union(v.literal("QUANTITY"), v.literal("SERIAL")),
    reorderPoint: v.optional(v.number()),

    status: v.union(v.literal("ACTIVE"), v.literal("DISCONTINUED")),
    attrs: v.optional(productAttrsValidator),
  })
    .index("by_org", ["orgId"])
    .index("by_org_sku", ["orgId", "sku"])
    .index("by_org_brand", ["orgId", "brandId"])
    .index("by_org_category", ["orgId", "categoryId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["orgId", "status"],
    }),

  /**
   * What kind of buyer this is, expressed as a discount off the product's
   * wholesale price. A percentage rather than a per-product price list, so
   * adding a tier does not mean re-pricing the whole catalog.
   */
  priceTiers: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    discountPercent: v.number(),
  }).index("by_org", ["orgId"]),

  /** Dealer accounts — the people you invoice, stored once instead of retyped. */
  customers: defineTable({
    orgId: v.id("organizations"),
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
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
  })
    .index("by_org", ["orgId"])
    .searchIndex("search_business", {
      searchField: "businessName",
      filterFields: ["orgId"],
    }),

  invoices: defineTable({
    // Optional only so existing rows survive the deploy that adds it. The
    // backfill in migrations.ts sets it, after which it becomes required.
    orgId: v.optional(v.id("organizations")),
    userId: v.id("users"),
    // The dealer this was raised for. Optional: `to` still holds the address
    // that was actually printed, so an invoice stays correct even if the
    // customer record is later edited.
    customerId: v.optional(v.id("customers")),
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
