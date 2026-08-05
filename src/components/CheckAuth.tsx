
//component for protected page

import { auth } from "@clerk/nextjs/server";
import { getAppMembership } from "@/lib/currentUser";
import { redirect } from "next/navigation";

//dashboard
export async function ProtectedPage(){
    const { userId } = await auth()

    if(!userId){
        redirect("/sign-in")
    }

    //no Convex row yet, or onboarding never finished — both land on /onboarding,
    //which creates the organization and makes this user its owner
    const membership = await getAppMembership()

    if(!membership){
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

    const membership = await getAppMembership()

    if(!membership){
        redirect("/onboarding")
    }

    redirect('/dashboard')
}
