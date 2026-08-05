import { auth, currentUser } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * The app-side view of the signed-in user, for Server Components.
 *
 * Clerk owns authentication; Convex owns domain data. `id` is the Convex
 * user document id that invoices and settings are keyed by.
 */
export interface AppUser {
  id: Id<"users">;
  clerkId: string;
  firstName?: string;
  lastName?: string;
  email: string;
  image?: string;
  /** Unset until onboarding completes — this is what gates /onboarding. */
  currency?: string;
}

/** Mints a Convex-scoped token from the Clerk session, or null when signed out. */
export async function getConvexToken(): Promise<string | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  return await getToken({ template: "convex" });
}

export async function getAppUser(): Promise<AppUser | null> {
  const token = await getConvexToken();
  if (!token) return null;

  const [doc, clerkUser] = await Promise.all([
    fetchQuery(api.users.current, {}, { token }),
    currentUser(),
  ]);

  // null until users.store has run for this Clerk account
  if (!doc) return null;

  return {
    id: doc._id,
    clerkId: doc.clerkId,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    image: clerkUser?.imageUrl ?? undefined,
    currency: doc.currency,
  };
}

/**
 * The signed-in user's organization and role, or null before onboarding.
 *
 * This — not `user.currency` — is what says "this account is set up". Server
 * Components gate on it, and it's the same membership row the Convex
 * functions authorize against, so the UI and the data layer can't disagree.
 */
export async function getAppMembership() {
  const token = await getConvexToken();
  if (!token) return null;

  return await fetchQuery(api.orgs.current, {}, { token });
}
