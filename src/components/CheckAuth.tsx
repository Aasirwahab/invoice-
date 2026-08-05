
//component for protected page

import { auth } from "@clerk/nextjs/server";
import { getAppUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";

//dashboard
export async function ProtectedPage(){
    const { userId } = await auth()

    if(!userId){
        redirect("/sign-in")
    }

    const user = await getAppUser()

    //no Convex row yet, or onboarding never finished — both land on /onboarding,
    //which creates the row and sets the currency
    if(!user || !user.currency){
        redirect("/onboarding")
    }

    return (
        <></>
    )
}

//component for unprotected page
//sign-in
//landing
export async function UnprotectedPage(){
    const { userId } = await auth()

    if(!userId){
        return <></>
    }

    const user = await getAppUser()

    if(!user || !user.currency){
        redirect("/onboarding")
    }

    redirect('/dashboard')
}
