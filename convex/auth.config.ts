/**
 * Ties Convex to Clerk.
 *
 * CLERK_JWT_ISSUER_DOMAIN is set on the CONVEX deployment (not .env), via:
 *   pnpm dlx convex env set CLERK_JWT_ISSUER_DOMAIN https://striking-mayfly-13.clerk.accounts.dev
 *
 * `applicationID` must match the name of the JWT template created in the
 * Clerk dashboard (Configure > JWT Templates > New template > Convex).
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
