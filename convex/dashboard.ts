import { query } from "./_generated/server";
import { currentUser } from "./users";

/**
 * Last-30-days rollup for the dashboard. Returns the same shape the old
 * GET /api/dashboard returned, minus the currency symbol — the client already
 * has the user's currency, so formatting stays on the client.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const recent = (
      await ctx.db
        .query("invoices")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .order("desc")
        .collect()
    ).filter((inv) => inv.invoice_date >= thirtyDaysAgo);

    const totalRevenue = recent.reduce((sum, inv) => sum + inv.total, 0);

    const chartData = recent.map((inv) => ({
      date: new Date(inv.invoice_date).toISOString().slice(0, 10),
      totalRevenue: inv.total,
      paidRevenue: inv.status === "PAID" ? inv.total : 0,
    }));

    return {
      totalRevenue,
      currency: user.currency ?? "USD",
      totalInvoice: recent.length,
      paidInvoice: recent.filter((i) => i.status === "PAID").length,
      UnpaidInvoice: recent.filter((i) => i.status === "UNPAID").length,
      recentInvoice: recent.slice(0, 5),
      chartData,
    };
  },
});
