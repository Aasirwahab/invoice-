"use client";
import Loading from "@/components/Loading";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default function PaidInvoicePage() {
  const { invoiceId } = useParams();
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  //undefined while loading, null when not found — the query is reactive, so
  //no manual refetch is needed after the mutation
  const data = useQuery(api.invoices.getById, {
    invoiceId: invoiceId as Id<"invoices">,
  });
  const updateInvoice = useMutation(api.invoices.update);

  const isLoading = data === undefined || isUpdating;

  const handleUpdate = async()=>{
    try {
        setIsUpdating(true)
        await updateInvoice({
            invoiceId : invoiceId as Id<"invoices">,
            status : "PAID"
        })
        toast.success("Invoice status updated")
    } catch (error) {
        console.log(error)
        toast.error("Something went wrong")
    }finally{
         setIsUpdating(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center  gap-4 relative z-10">
        <Link href={"/invoice"} className={buttonVariants({ size: "icon" })}>
          <ArrowLeft />
        </Link>
        <h1 className="text-xl font-semibold"> Invoice Status</h1>
      </div>

      <div className="min-h-[calc(100dvh-200px)] relative flex justify-center flex-col items-center">
        <div className="absolute h-full w-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>

        <Card className="min-w-sm relative z-10">
          <CardHeader>
            <CardTitle>Invoice Status</CardTitle>
            <CardDescription>Make your invoice paid</CardDescription>
          </CardHeader>
          <CardContent className="py-4">
            {isLoading ? (
              <Loading />
            ) : data?.status === "UNPAID" ? (
              <Button className="w-full" onClick={handleUpdate}>Make Invoice Paid</Button>
            ) : (
              <div
                className={cn(
                  "bg-green-50 text-green-600 font-semibold p-4 flex items-center gap-3"
                )}
              >
                <CheckIcon />
                <p>Your invoice payment done</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
