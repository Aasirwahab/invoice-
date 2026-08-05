import { query } from "./_generated/server";
import { currentMember } from "./orgs";

/**
 * Last-30-days rollup for the dashboard, across the whole organization.
 * Returns the raw numbers plus the org currency; formatting stays on the
 * client.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return null;

    const org = await ctx.db.get(member.orgId);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const recent = (
      await ctx.db
        .query("invoices")
        .withIndex("by_orgId", (q) => q.eq("orgId", member.orgId))
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
      currency: org?.defaultCurrency ?? "USD",
      totalInvoice: recent.length,
      paidInvoice: recent.filter((i) => i.status === "PAID").length,
      UnpaidInvoice: recent.filter((i) => i.status === "UNPAID").length,
      recentInvoice: recent.slice(0, 5),
      chartData,
    };
  },
});
