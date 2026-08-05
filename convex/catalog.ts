import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { currentMember, requireRole } from "./orgs";

/**
 * Brands, categories and products.
 *
 * Reads need any active membership; writes need MANAGER, because product cost
 * and wholesale prices are commercially sensitive and SALES should not be able
 * to move them.
 */

type TCategoryKind =
  | "WATCH"
  | "STRAP"
  | "BATTERY"
  | "BOX"
  | "TOOL"
  | "OTHER";

const categoryKind = v.union(
  v.literal("WATCH"),
  v.literal("STRAP"),
  v.literal("BATTERY"),
  v.literal("BOX"),
  v.literal("TOOL"),
  v.literal("OTHER")
);

const productAttrs = v.union(
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
  v.object({ kind: v.literal("GENERIC") })
);

const PAGE_SIZE = 20;

/* ---------------------------------------------------------------- brands */

export const listBrands = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];

    return await ctx.db
      .query("brands")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();
  },
});

export const createBrand = mutation({
  args: { name: v.string(), logo: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const name = args.name.trim();
    if (!name) throw new Error("Brand name is required");

    const clash = await ctx.db
      .query("brands")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .filter((q) => q.eq(q.field("name"), name))
      .first();

    if (clash) throw new Error(`Brand "${name}" already exists`);

    const brandId = await ctx.db.insert("brands", {
      orgId: member.orgId,
      name,
      logo: args.logo,
      status: "ACTIVE",
    });

    return { brandId, message: "Brand created" };
  },
});

export const updateBrand = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    logo: v.optional(v.id("_storage")),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("INACTIVE"))),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const { brandId, ...rest } = args;

    const existing = await ctx.db.get(brandId);
    if (!existing || existing.orgId !== member.orgId) {
      throw new Error("No brand found");
    }

    await ctx.db.patch(
      brandId,
      Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
      )
    );

    return { message: "Brand updated" };
  },
});

/**
 * Brands a watch wholesaler is most likely to actually stock, from
 * mass-market up. Seeded on request rather than automatically — the list is a
 * starting point, not an opinion about what you sell, and you can rename or
 * deactivate any of them afterwards.
 */
const DEFAULT_BRANDS = [
  "Seiko",
  "Citizen",
  "Casio",
  "G-Shock",
  "Orient",
  "Alba",
  "Q&Q",
  "Titan",
  "Sonata",
  "Fastrack",
  "Timex",
  "Tissot",
  "Fossil",
  "Swatch",
  "Rado",
  "Longines",
  "Bulova",
  "Michael Kors",
  "Armani Exchange",
  "Daniel Wellington",
  "Diesel",
  "Guess",
  "Police",
  "Curren",
  "Naviforce",
  "Skmei",
  "Rolex",
  "Omega",
  "TAG Heuer",
];

/**
 * Categories with the right `kind` attached, so the product form shows watch
 * fields for watches and strap fields for straps from the first product on.
 */
const DEFAULT_CATEGORIES: { name: string; kind: TCategoryKind }[] = [
  { name: "Watches", kind: "WATCH" },
  { name: "Straps & Bracelets", kind: "STRAP" },
  { name: "Batteries", kind: "BATTERY" },
  { name: "Watch Boxes", kind: "BOX" },
  { name: "Tools & Spares", kind: "TOOL" },
  { name: "Accessories", kind: "OTHER" },
];

/** Adds any of the defaults that aren't already present. Safe to re-run. */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const member = await requireRole(ctx, "MANAGER");
    return await applyCatalogDefaults(ctx, member.orgId);
  },
});

/**
 * The seeding itself, split from its auth wrapper so it can also be driven
 * from the CLI for an org whose owner has not clicked the button yet.
 */
export async function applyCatalogDefaults(
  ctx: MutationCtx,
  orgId: Id<"organizations">
) {
  {
    const existingBrands = await ctx.db
      .query("brands")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const existingCategories = await ctx.db
      .query("categories")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    const haveBrand = new Set(
      existingBrands.map((b) => b.name.trim().toLowerCase())
    );
    const haveCategory = new Set(
      existingCategories.map((c) => c.name.trim().toLowerCase())
    );

    let brandsAdded = 0;
    for (const name of DEFAULT_BRANDS) {
      if (haveBrand.has(name.toLowerCase())) continue;
      await ctx.db.insert("brands", { orgId, name, status: "ACTIVE" });
      brandsAdded++;
    }

    let categoriesAdded = 0;
    for (const category of DEFAULT_CATEGORIES) {
      if (haveCategory.has(category.name.toLowerCase())) continue;
      await ctx.db.insert("categories", {
        orgId,
        name: category.name,
        kind: category.kind,
      });
      categoriesAdded++;
    }

    return {
      brandsAdded,
      categoriesAdded,
      message: `Added ${brandsAdded} brands and ${categoriesAdded} categories`,
    };
  }
}

/* ------------------------------------------------------------ categories */

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];

    return await ctx.db
      .query("categories")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();
  },
});

export const createCategory = mutation({
  args: { name: v.string(), kind: categoryKind },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const name = args.name.trim();
    if (!name) throw new Error("Category name is required");

    const clash = await ctx.db
      .query("categories")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .filter((q) => q.eq(q.field("name"), name))
      .first();

    if (clash) throw new Error(`Category "${name}" already exists`);

    const categoryId = await ctx.db.insert("categories", {
      orgId: member.orgId,
      name,
      kind: args.kind,
    });

    return { categoryId, message: "Category created" };
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    kind: v.optional(categoryKind),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const { categoryId, ...rest } = args;

    const existing = await ctx.db.get(categoryId);
    if (!existing || existing.orgId !== member.orgId) {
      throw new Error("No category found");
    }

    await ctx.db.patch(
      categoryId,
      Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
      )
    );

    return { message: "Category updated" };
  },
});

/* -------------------------------------------------------------- products */

/**
 * Resolves storage ids to signed URLs so the client can render images without
 * knowing anything about Convex storage.
 */
async function withImageUrls(ctx: QueryCtx, product: Doc<"products">) {
  // Index-aligned with `images` — a null here means that storage id no longer
  // resolves. Dropping nulls instead would shift every later URL onto the
  // wrong image.
  const imageUrls = await Promise.all(
    (product.images ?? []).map((id) => ctx.storage.getUrl(id))
  );

  return { ...product, imageUrls };
}

/**
 * Paged product list with optional text search and brand/category filters.
 *
 * Search goes through the search index; the plain listing walks the org index.
 * Both then filter in memory — fine for a dealership catalog, and the point at
 * which it stops being fine is the point at which you want cursor pagination
 * rather than a bigger in-memory slice.
 */
export const listProducts = query({
  args: {
    search: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    categoryId: v.optional(v.id("categories")),
    includeDiscontinued: v.optional(v.boolean()),
    page: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const member = await currentMember(ctx);
    if (!member) {
      return { data: [], totalCount: 0, totalPage: 0, page: 1 };
    }

    const term = args.search?.trim();

    let rows: Doc<"products">[];
    if (term) {
      rows = await ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) =>
          q.search("name", term).eq("orgId", member.orgId)
        )
        .take(200);
    } else {
      rows = await ctx.db
        .query("products")
        .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
        .order("desc")
        .collect();
    }

    const filtered = rows.filter((p) => {
      if (args.brandId && p.brandId !== args.brandId) return false;
      if (args.categoryId && p.categoryId !== args.categoryId) return false;
      if (!args.includeDiscontinued && p.status === "DISCONTINUED") return false;
      return true;
    });

    const page = args.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(skip, skip + PAGE_SIZE);

    return {
      data: await Promise.all(slice.map((p) => withImageUrls(ctx, p))),
      totalCount: filtered.length,
      totalPage: Math.ceil(filtered.length / PAGE_SIZE),
      page,
    };
  },
});

/**
 * Slim, unpaged list for the invoice line picker: enough to search, label and
 * price a row, without the images and attributes the catalog page needs.
 */
export const listForPicker = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];

    const [products, brands] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
        .collect(),
      ctx.db
        .query("brands")
        .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
        .collect(),
    ]);

    return products
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({
        _id: p._id,
        sku: p.sku,
        name: p.name,
        brandId: p.brandId,
        brandName: brands.find((b) => b._id === p.brandId)?.name ?? "",
        wholesalePrice: p.wholesalePrice,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const member = await currentMember(ctx);
    if (!member) return null;

    const product = await ctx.db.get(args.productId);
    if (!product || product.orgId !== member.orgId) return null;

    return await withImageUrls(ctx, product);
  },
});

/**
 * Resolves a typed brand name to an id, creating the brand if it is new.
 *
 * Done server-side inside the product mutation so a failed product insert
 * cannot leave an orphan brand behind — creating it from the client would be
 * two round trips with no way to undo the first.
 */
async function resolveBrand(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  brandName: string | undefined,
  brandId: Id<"brands"> | undefined
): Promise<Id<"brands"> | undefined> {
  const name = brandName?.trim();

  // No name typed — keep whatever id the caller already had.
  if (!name) return brandId;

  const existing = await ctx.db
    .query("brands")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();

  const match = existing.find(
    (b) => b.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (match) return match._id;

  return await ctx.db.insert("brands", { orgId, name, status: "ACTIVE" });
}

const productFields = {
  sku: v.string(),
  name: v.string(),
  brandId: v.optional(v.id("brands")),
  /** Free-typed alternative to brandId; created on the fly when unknown. */
  brandName: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  reference: v.optional(v.string()),
  description: v.optional(v.string()),
  images: v.optional(v.array(v.id("_storage"))),
  costPrice: v.number(),
  wholesalePrice: v.number(),
  msrp: v.optional(v.number()),
  trackingMode: v.union(v.literal("QUANTITY"), v.literal("SERIAL")),
  reorderPoint: v.optional(v.number()),
  attrs: v.optional(productAttrs),
};

export const createProduct = mutation({
  args: productFields,
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const sku = args.sku.trim().toUpperCase();

    await assertSkuFree(ctx, member.orgId, sku);
    assertPrices(args.costPrice, args.wholesalePrice);

    const { brandName, ...fields } = args;
    const brandId = await resolveBrand(
      ctx,
      member.orgId,
      brandName,
      args.brandId
    );

    const productId = await ctx.db.insert("products", {
      ...fields,
      sku,
      brandId,
      orgId: member.orgId,
      status: "ACTIVE",
    });

    return { productId, message: "Product created" };
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    sku: v.optional(v.string()),
    name: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    brandName: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    reference: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.optional(v.array(v.id("_storage"))),
    costPrice: v.optional(v.number()),
    wholesalePrice: v.optional(v.number()),
    msrp: v.optional(v.number()),
    trackingMode: v.optional(
      v.union(v.literal("QUANTITY"), v.literal("SERIAL"))
    ),
    reorderPoint: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("ACTIVE"), v.literal("DISCONTINUED"))
    ),
    attrs: v.optional(productAttrs),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");
    const { productId, brandName, ...rest } = args;

    const existing = await ctx.db.get(productId);
    if (!existing || existing.orgId !== member.orgId) {
      throw new Error("No product found");
    }

    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined)
    );

    // A typed brand name wins over the stale id the form was loaded with,
    // otherwise renaming to a new brand would silently keep the old one.
    if (brandName !== undefined) {
      patch.brandId = await resolveBrand(
        ctx,
        member.orgId,
        brandName,
        args.brandId
      );
    }

    if (typeof patch.sku === "string") {
      patch.sku = patch.sku.trim().toUpperCase();
      if (patch.sku !== existing.sku) {
        await assertSkuFree(ctx, member.orgId, patch.sku as string);
      }
    }

    assertPrices(
      patch.costPrice !== undefined
        ? (patch.costPrice as number)
        : existing.costPrice,
      patch.wholesalePrice !== undefined
        ? (patch.wholesalePrice as number)
        : existing.wholesalePrice
    );

    await ctx.db.patch(productId, patch);

    return { message: "Product updated" };
  },
});

/** Upload target for product photographs. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "MANAGER");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Bulk import. Rows that fail validation are reported rather than aborting the
 * batch — a 400-line catalog with three bad rows should import 397, not none.
 * Existing SKUs are updated in place so a re-import is a sync, not a duplicate.
 */
export const importProducts = mutation({
  args: {
    rows: v.array(
      v.object({
        sku: v.string(),
        name: v.string(),
        brandName: v.optional(v.string()),
        categoryName: v.optional(v.string()),
        reference: v.optional(v.string()),
        costPrice: v.number(),
        wholesalePrice: v.number(),
        msrp: v.optional(v.number()),
        trackingMode: v.optional(
          v.union(v.literal("QUANTITY"), v.literal("SERIAL"))
        ),
        reorderPoint: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");

    const brands = await ctx.db
      .query("brands")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();

    const brandByName = new Map(brands.map((b) => [b.name.toLowerCase(), b._id]));
    const categoryByName = new Map(
      categories.map((c) => [c.name.toLowerCase(), c._id])
    );

    let created = 0;
    let updated = 0;
    const errors: { sku: string; reason: string }[] = [];

    for (const row of args.rows) {
      const sku = row.sku.trim().toUpperCase();

      try {
        if (!sku) throw new Error("SKU is required");
        if (!row.name.trim()) throw new Error("Name is required");
        assertPrices(row.costPrice, row.wholesalePrice);

        // Brands and categories named in the file are created on the fly —
        // otherwise every import needs a manual setup pass first.
        let brandId: Id<"brands"> | undefined;
        if (row.brandName?.trim()) {
          const key = row.brandName.trim().toLowerCase();
          brandId = brandByName.get(key);
          if (!brandId) {
            brandId = await ctx.db.insert("brands", {
              orgId: member.orgId,
              name: row.brandName.trim(),
              status: "ACTIVE",
            });
            brandByName.set(key, brandId);
          }
        }

        let categoryId: Id<"categories"> | undefined;
        if (row.categoryName?.trim()) {
          const key = row.categoryName.trim().toLowerCase();
          categoryId = categoryByName.get(key);
          if (!categoryId) {
            categoryId = await ctx.db.insert("categories", {
              orgId: member.orgId,
              name: row.categoryName.trim(),
              kind: "OTHER",
            });
            categoryByName.set(key, categoryId);
          }
        }

        const existing = await ctx.db
          .query("products")
          .withIndex("by_org_sku", (q) =>
            q.eq("orgId", member.orgId).eq("sku", sku)
          )
          .unique();

        const fields = {
          name: row.name.trim(),
          brandId,
          categoryId,
          reference: row.reference?.trim() || undefined,
          costPrice: row.costPrice,
          wholesalePrice: row.wholesalePrice,
          msrp: row.msrp,
          trackingMode: row.trackingMode ?? ("QUANTITY" as const),
          reorderPoint: row.reorderPoint,
        };

        if (existing) {
          await ctx.db.patch(existing._id, fields);
          updated++;
        } else {
          await ctx.db.insert("products", {
            orgId: member.orgId,
            sku,
            status: "ACTIVE",
            ...fields,
          });
          created++;
        }
      } catch (error) {
        errors.push({
          sku: sku || "(blank)",
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { created, updated, failed: errors.length, errors };
  },
});

async function assertSkuFree(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  sku: string
) {
  const clash = await ctx.db
    .query("products")
    .withIndex("by_org_sku", (q) => q.eq("orgId", orgId).eq("sku", sku))
    .unique();

  if (clash) throw new Error(`SKU "${sku}" already exists`);
}

function assertPrices(costPrice: number, wholesalePrice: number) {
  if (costPrice < 0 || wholesalePrice < 0) {
    throw new Error("Prices cannot be negative");
  }
}
