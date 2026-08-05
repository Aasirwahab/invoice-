import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Page routes that require a signed-in user.
 *
 * API routes are deliberately NOT listed. They perform their own checks via
 * getAppUser(), and /api/invoice/[userId]/[invoiceId] must stay reachable
 * without a session — that is the download link emailed to clients.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/invoice(.*)",
  "/settings(.*)",
  "/onboarding(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
