import { getAppUser, getConvexToken } from "@/lib/currentUser";
import { sendEmail } from "@/lib/email.config";
import { currencyOption, TCurrencyKey } from "@/lib/utils";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { format } from "date-fns";
import { NextResponse, NextRequest } from "next/server";
import { InvoiceTemplate } from "../../../../components/template/SendInvoiceEmail";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const [user, token] = await Promise.all([getAppUser(), getConvexToken()]);

    if (!user || !token) {
      return NextResponse.json({
        message: "Unauthorized access",
      });
    }

    const { invoiceId } = await params;
    const { subject } = await request.json();

    //getById is ownership-checked, so this cannot email someone else's invoice
    const invoiceData = await fetchQuery(
      api.invoices.getById,
      { invoiceId: invoiceId as Id<"invoices"> },
      { token }
    );

    if (!invoiceData) {
      return NextResponse.json({
        message: "No invoice found",
      });
    }

    const invoiceURL = `${process.env.DOMAIN}/api/invoice/${user.id}/${invoiceId}`

    const emailResponse = await sendEmail(
      invoiceData.to.email,
      subject,
      InvoiceTemplate({
        firstName : user.firstName as string,
        invoiceNo : invoiceData.invoice_no,
        dueDate : format(invoiceData.due_date,"PPP"),
        total : `${currencyOption[invoiceData.currency as TCurrencyKey ]} ${invoiceData.total}`,
        invoiceURL :invoiceURL ,
      })
    );

    return NextResponse.json({
        message : "Email send successfully",
        data : emailResponse
    })

  } catch (error: any) {
    return NextResponse.json({
      message: error || error.message || "Something went wrong",
    });
  }
}
