"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencyOption, DEFAULT_CURRENCY } from "@/lib/utils";
import { onboardingSchema } from "@/lib/zodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function OnboardingPage() {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<z.infer<typeof onboardingSchema>>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      currency: DEFAULT_CURRENCY,
    },
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter()

  const storeUser = useMutation(api.users.store)
  const updateProfile = useMutation(api.users.updateProfile)
  const claimInvite = useMutation(api.orgs.claimInvite)
  const createOrg = useMutation(api.orgs.createOrg)

  //first stop after sign-up, so this is where the Convex user row gets created.
  //claimInvite runs straight after in case an owner already added this email to
  //the team — staff join an existing company instead of creating a second one.
  useEffect(()=>{
    storeUser()
      .then(()=>claimInvite())
      .then((result)=>{
        if(result?.claimed){
          router.replace("/dashboard")
        }
      })
      .catch((error)=>console.log(error))
  },[storeUser, claimInvite, router])

  const onSubmit = async(data : z.infer<typeof onboardingSchema>)=>{
    try {
        setIsLoading(true)
        setSubmitError(null)
        await storeUser()
        await updateProfile({
            firstName : data.firstName,
            lastName : data.lastName,
        })
        await createOrg({
            name : data.companyName,
            defaultCurrency : data.currency ?? DEFAULT_CURRENCY,
        })
        router.push("/dashboard")
    } catch (error) {
        //onboarding is the one screen with no other way forward, so a silent
        //console.log here strands the user on a dead form
        setSubmitError(
          error instanceof Error ? error.message : "Something went wrong"
        )
    }finally{
        setIsLoading(false)
    }
  }

  return (
    <div className="flex justify-center items-center flex-col min-h-dvh h-dvh overflow-auto relative p-4">
      <div className="absolute top-0 z-[-2] h-screen w-screen bg-white bg-[radial-gradient(100%_50%_at_50%_0%,rgba(140,0,255,0.13)_0,rgba(140,0,255,0)_50%,rgba(140,0,255,0)_100%)]"></div>
      <div className="absolute h-full w-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>

      <Card className="min-w-xs lg:min-w-sm w-full max-w-sm relative z-10">
        <CardHeader>
          <CardTitle>You are almost finished</CardTitle>
          <CardDescription>
            Tell us about you and your company to get set up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-2">
              <Label>First Name</Label>
              <Input
                placeholder="Joe"
                type="text"
                {...register("firstName", { required: true })}
                disabled={isLoading}
              />
              {
                errors.firstName && (
                    <p className="text-xs text-red-500">
                        {errors.firstName.message}
                    </p>
                )
              }
            </div>
            <div className="grid gap-2">
              <Label>Last Name</Label>
              <Input placeholder="Due" type="text"  {...register("lastName", { required: true })}    disabled={isLoading}/>
              {
                errors.lastName && (
                    <p className="text-xs text-red-500">
                        {errors.lastName.message}
                    </p>
                )
              }
            </div>
            <div className="grid gap-2">
              <Label>Company Name</Label>
              <Input
                placeholder="Acme Watch Trading"
                type="text"
                {...register("companyName", { required: true })}
                disabled={isLoading}
              />
              {
                errors.companyName && (
                    <p className="text-xs text-red-500">
                        {errors.companyName.message}
                    </p>
                )
              }
            </div>
            <div className="grid gap-2">
              <Label>Select Currency</Label>
              {/* Radix Select is not a native input, so register() never sees
                  its value — Controller is what actually binds it. */}
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(currencyOption).map((item: string) => {
                        return (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {
              submitError && (
                <p className="text-xs text-red-500">{submitError}</p>
              )
            }
            <Button  disabled={isLoading}>
                {
                    isLoading ? "Please wait..." : "Finish onboarding"
                }
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
