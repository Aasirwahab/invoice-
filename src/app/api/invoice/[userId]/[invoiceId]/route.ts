import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { format } from "date-fns";
import currencyFormat from "@/lib/CurrencyFormate";

const FULL_WIDTH = 211;
const COLOR_CODE = "#8c00ff";
const PAGE_BOTTOM = 270;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string; userId: string }> }
) {
  try {
    const { userId, invoiceId } = await params;

    //public download link emailed to clients — no session, so this uses the
    //unauthenticated getPublic query, where the invoice id is the capability
    const result = await fetchQuery(api.invoices.getPublic, {
      invoiceId: invoiceId as Id<"invoices">,
      userId: userId as Id<"users">,
    });

    const invoice = result?.invoice ?? null;
    const settings = result?.settings ?? null;

    if (!invoice) {
      return NextResponse.json({ message: "No invoice found" }, { status: 404 });
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const money = (amount: number) => currencyFormat(amount, invoice.currency);

    /**
     * jsPDF throws on undefined, and most address lines are optional, so every
     * write goes through here. This is what was turning an empty address line
     * into a blank page and an unreadable "{}" error.
     */
    const text = (
      value: string | number | undefined | null,
      x: number,
      y: number,
      options?: { align?: "left" | "center" | "right" }
    ) => {
      if (value === undefined || value === null || value === "") return;
      doc.text(String(value), x, y, options);
    };

    //top border
    doc.setFillColor(COLOR_CODE);
    doc.rect(0, 0, FULL_WIDTH, 2, "F");

    //invoice logo — optional, so the invoice still prints before branding is set
    if (settings?.invoiceLogo) {
      try {
        doc.addImage(settings.invoiceLogo, 15, 13, 60, 12);
      } catch {
        // A corrupt or unsupported image must not cost you the whole invoice.
      }
    }

    doc.setFontSize(25);
    doc.setTextColor("#000");
    text("INVOICE", FULL_WIDTH - 15, 22, { align: "right" });

    //company details (issuer)
    doc.setFontSize(12);
    doc.setFont("times", "bold");
    text(invoice.from.name, 15, 35);

    doc.setFontSize(9);
    doc.setFont("times", "normal");
    text(invoice.from.address1, 15, 40);
    text(invoice.from.address2, 15, 45);
    text(invoice.from.address3, 15, 50);

    //invoice no, date, due date
    text(`Invoice No. : ${invoice.invoice_no}`, FULL_WIDTH - 15, 35, {
      align: "right",
    });
    text(
      `Invoice Date : ${format(invoice.invoice_date, "PP")}`,
      FULL_WIDTH - 15,
      40,
      { align: "right" }
    );
    text(`Due Date : ${format(invoice.due_date, "PP")}`, FULL_WIDTH - 15, 45, {
      align: "right",
    });

    text("Bill To.", 15, 60);

    //client details
    doc.setFontSize(12);
    doc.setFont("times", "bold");
    text(invoice.to.name, 15, 70);

    doc.setFontSize(9);
    doc.setFont("times", "normal");
    text(invoice.to.address1, 15, 75);
    text(invoice.to.address2, 15, 80);
    text(invoice.to.address3, 15, 85);
    text(invoice.to.email, 15, 90);

    const ITEM_X = 18;
    const SKU_X = 95;
    const QUANTITY_X = 125;
    const PRICE_X = 145;
    const TOTAL_X = FULL_WIDTH - 15;

    const drawItemsHeader = (y: number) => {
      doc.setFillColor(COLOR_CODE);
      doc.rect(15, y - 4, FULL_WIDTH - 30, 6, "F");
      doc.setTextColor("#fff");
      doc.setFontSize(10.5);
      doc.setFont("times", "bold");
      text("Item", ITEM_X, y);
      text("SKU", SKU_X, y);
      text("Qty", QUANTITY_X, y);
      text("Price", PRICE_X, y);
      text("Total", TOTAL_X, y, { align: "right" });
      doc.setTextColor("#000");
      doc.setFont("times", "normal");
      doc.setFontSize(10);
    };

    let yAxis = 103;
    drawItemsHeader(yAxis);

    for (const item of invoice.items) {
      yAxis += 6;

      // A wholesale order can easily run past one page.
      if (yAxis > PAGE_BOTTOM) {
        doc.addPage();
        yAxis = 25;
        drawItemsHeader(yAxis);
        yAxis += 6;
      }

      // Long product names would otherwise run under the SKU column.
      const name = doc.splitTextToSize(item.item_name, 72)[0];
      text(name, ITEM_X, yAxis);
      text(item.sku, SKU_X, yAxis);
      text(item.quantity, QUANTITY_X, yAxis);
      text(money(item.price), PRICE_X, yAxis);
      text(money(item.total), TOTAL_X, yAxis, { align: "right" });
    }

    //totals — keep them on the page rather than running off the bottom
    if (yAxis > PAGE_BOTTOM - 60) {
      doc.addPage();
      yAxis = 25;
    }

    const discount = invoice.discount ?? 0;
    const netOfDiscount = invoice.sub_total - discount;
    const taxPercentage = invoice.tax_percentage ?? 0;
    const taxAmount = (netOfDiscount * taxPercentage) / 100;
    // Tax is added to what the customer owes, not taken off it.
    const totalAmount = netOfDiscount + taxAmount;

    const LABEL_X = 150;
    let totalsY = yAxis + 15;

    text("Sub total :", LABEL_X, totalsY);
    text(money(invoice.sub_total), TOTAL_X, totalsY, { align: "right" });

    if (discount) {
      totalsY += 5;
      text("Discount :", LABEL_X, totalsY);
      text(`-${money(discount)}`, TOTAL_X, totalsY, { align: "right" });
    }

    if (taxPercentage) {
      totalsY += 5;
      text(`Tax ${taxPercentage}% :`, LABEL_X, totalsY);
      text(money(taxAmount), TOTAL_X, totalsY, { align: "right" });
    }

    totalsY += 7;
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    text("Total :", LABEL_X, totalsY);
    text(money(totalAmount), TOTAL_X, totalsY, { align: "right" });
    doc.setFont("times", "normal");
    doc.setFontSize(10);

    //signature — optional, same reasoning as the logo
    let footerY = totalsY + 10;
    if (settings?.signature?.image) {
      try {
        doc.addImage(settings.signature.image, FULL_WIDTH - 60, footerY, 50, 20);
        footerY += 25;
      } catch {
        // ignore an unusable signature image
      }
    }
    if (settings?.signature?.name) {
      text(settings.signature.name, TOTAL_X, footerY, { align: "right" });
      footerY += 10;
    }

    if (invoice.notes) {
      doc.setFont("times", "bold");
      text("Notes :", 15, footerY);
      doc.setFont("times", "normal");
      for (const line of doc.splitTextToSize(invoice.notes, FULL_WIDTH - 40)) {
        footerY += 5;
        text(line, 15, footerY);
      }
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline",
      },
    });
  } catch (error) {
    // `error || error.message` always returned the Error object, which
    // JSON.stringify renders as {} — the reason was being thrown away.
    console.error("Invoice PDF failed", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Could not build the invoice",
      },
      { status: 500 }
    );
  }
}
