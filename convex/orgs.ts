import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./users";

/**
 * Membership is the authorization boundary for the whole app: every domain
 * query resolves the caller's member row first and scopes by its orgId. A
 * query that forgets to do that leaks another company's data, so nothing
 * should read a domain table without going through requireMember/requireRole.
 */

type Role = Doc<"members">["role"];

/** Higher number wins. VIEWER can read; SALES can trade; MANAGER can price. */
const RANK: Record<Role, number> = {
  VIEWER: 0,
  SALES: 1,
  MANAGER: 2,
  OWNER: 3,
};

/**
 * The caller's active membership, or null when signed out, not yet onboarded,
 * or disabled.
 *
 * Also claims a pending invite: an owner adds staff by email before that
 * person has ever signed in, so the first authenticated request that finds an
 * INVITED row matching the caller's email adopts it. Queries cannot write, so
 * the claim itself happens in `claimInvite` — here we only match on clerkId.
 */
export async function currentMember(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"members"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const member = await ctx.db
    .query("members")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!member || member.status !== "ACTIVE") return null;
  return member;
}

/** Same, but throws — for anything that must not run without an org. */
export async function requireMember(ctx: QueryCtx | MutationCtx) {
  const member = await currentMember(ctx);
  if (!member) throw new Error("Unauthorized access");
  return member;
}

/** Throws unless the caller's role is at least `minimum`. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  minimum: Role
) {
  const member = await requireMember(ctx);
  if (RANK[member.role] < RANK[minimum]) {
    throw new Error(`Requires ${minimum} access or higher`);
  }
  return member;
}

/** Org + role for the signed-in user; null before onboarding. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return null;

    const org = await ctx.db.get(member.orgId);
    if (!org) return null;

    return { org, member };
  },
});

/**
 * Onboarding. Creates the dealership and makes the caller its OWNER.
 *
 * Idempotent: a double-submit or a refresh mid-flight returns the existing
 * org rather than creating a second one and stranding the invoices.
 */
export const createOrg = mutation({
  args: {
    name: v.string(),
    defaultCurrency: v.string(),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", user.clerkId))
      .unique();

    if (existing) {
      return { orgId: existing.orgId, message: "Already a member" };
    }

    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      legalName: args.legalName,
      taxId: args.taxId,
      defaultCurrency: args.defaultCurrency,
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

    // Legacy mirror — CheckAuth and the PDF route still read users.currency.
    await ctx.db.patch(user._id, { currency: args.defaultCurrency });

    return { orgId, message: "Organization created successfully" };
  },
});

/**
 * Adopts an outstanding invite for the signed-in user, matched by email.
 * Called on sign-in alongside users.store; a no-op when there is nothing to
 * claim, so it is safe to call on every page load.
 */
export const claimInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const alreadyMember = await ctx.db
      .query("members")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", user.clerkId))
      .unique();

    if (alreadyMember) return { claimed: false };

    const invite = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", user.email))
      .filter((q) => q.eq(q.field("status"), "INVITED"))
      .first();

    if (!invite) return { claimed: false };

    await ctx.db.patch(invite._id, {
      clerkId: user.clerkId,
      userId: user._id,
      status: "ACTIVE",
    });

    const org = await ctx.db.get(invite.orgId);
    if (org) {
      await ctx.db.patch(user._id, { currency: org.defaultCurrency });
    }

    return { claimed: true, orgId: invite.orgId };
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return null;
    return await ctx.db.get(member.orgId);
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    legalName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    address1: v.optional(v.string()),
    address2: v.optional(v.string()),
    address3: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
    invoicePrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await requireRole(ctx, "MANAGER");

    const patch = Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined)
    );

    await ctx.db.patch(member.orgId, patch);

    return { message: "Organization updated successfully" };
  },
});

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];

    return await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", member.orgId))
      .collect();
  },
});

/**
 * Invites staff by email. The row exists before they sign in; `claimInvite`
 * binds it to their Clerk account on first login.
 */
export const inviteMember = mutation({
  args: {
    email: v.string(),
    role: v.union(
      v.literal("MANAGER"),
      v.literal("SALES"),
      v.literal("VIEWER")
    ),
  },
  handler: async (ctx, args) => {
    const inviter = await requireRole(ctx, "OWNER");
    const email = args.email.trim().toLowerCase();

    const clash = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (clash) throw new Error("That email is already on the team");

    await ctx.db.insert("members", {
      orgId: inviter.orgId,
      email,
      role: args.role,
      status: "INVITED",
      invitedBy: inviter._id,
    });

    return { message: "Invite created — they join on first sign-in" };
  },
});

export const updateMemberRole = mutation({
  args: {
    memberId: v.id("members"),
    role: v.union(
      v.literal("OWNER"),
      v.literal("MANAGER"),
      v.literal("SALES"),
      v.literal("VIEWER")
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "OWNER");
    const target = await requireSameOrg(ctx, actor.orgId, args.memberId);

    // Refuse to remove the last owner — otherwise the org becomes unmanageable
    // and only a direct database edit can recover it.
    if (target.role === "OWNER" && args.role !== "OWNER") {
      await assertNotLastOwner(ctx, actor.orgId, target._id);
    }

    await ctx.db.patch(args.memberId, { role: args.role });
    return { message: "Role updated" };
  },
});

export const setMemberStatus = mutation({
  args: {
    memberId: v.id("members"),
    status: v.union(v.literal("ACTIVE"), v.literal("DISABLED")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "OWNER");
    const target = await requireSameOrg(ctx, actor.orgId, args.memberId);

    if (target.role === "OWNER" && args.status === "DISABLED") {
      await assertNotLastOwner(ctx, actor.orgId, target._id);
    }

    await ctx.db.patch(args.memberId, { status: args.status });
    return { message: "Member updated" };
  },
});

/** Guards against acting on a member row belonging to another org. */
async function requireSameOrg(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  memberId: Id<"members">
) {
  const target = await ctx.db.get(memberId);
  if (!target || target.orgId !== orgId) throw new Error("No member found");
  return target;
}

async function assertNotLastOwner(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  excludingId: Id<"members">
) {
  const owners = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .filter((q) => q.eq(q.field("role"), "OWNER"))
    .collect();

  const remaining = owners.filter(
    (o) => o._id !== excludingId && o.status === "ACTIVE"
  );

  if (remaining.length === 0) {
    throw new Error("The organization must keep at least one active owner");
  }
}
