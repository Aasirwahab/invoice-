import { getAppUser } from "@/lib/currentUser";
import InvoiceClientPage from "../_component/InvoiceClientPage";
import { Suspense } from "react";
import Loading from "@/components/Loading";

export default async function InvoicePage(){
    const user = await getAppUser()
    return(
        <Suspense fallback={<Loading/>}>
            <InvoiceClientPage userId={user?.id} currency={user?.currency}/>
        </Suspense>
    )
}