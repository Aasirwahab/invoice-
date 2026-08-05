import { ArrowLeft } from "lucide-react";
import CreateEditInvoice from "../../_component/CreateEditInvoice";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getAppUser } from "@/lib/currentUser";

export default async function InvoiceCreate() {
  const user = await getAppUser();

  return (
    <div className="p-4">
      <div className="flex items-center  gap-4">
        <Link href={"/invoice"} className={buttonVariants({ size: "icon" })}>
          <ArrowLeft />
        </Link>
        <h1 className="text-xl font-semibold">Create Invoice</h1>
      </div>
      <CreateEditInvoice
        firstName={user?.firstName}
        lastName={user?.lastName}
        email={user?.email}
        currency={user?.currency}
      />
    </div>
  );
}
