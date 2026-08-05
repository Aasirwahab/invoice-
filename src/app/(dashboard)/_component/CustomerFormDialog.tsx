"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type TForm = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  address3: string;
  taxId: string;
  tierId: string;
  creditLimit: string;
  paymentTermsDays: string;
};

const EMPTY: TForm = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  address3: "",
  taxId: "",
  tierId: "",
  creditLimit: "",
  paymentTermsDays: "",
};

const num = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function CustomerFormDialog({
  open,
  onOpenChange,
  customerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: Id<"customers"> | null;
}) {
  const customers = useQuery(api.customers.list, {});
  const tiers = useQuery(api.customers.listTiers);
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const seedTiers = useMutation(api.customers.seedTiers);

  const [form, setForm] = useState<TForm>(EMPTY);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const isEdit = Boolean(customerId);
  const existing = customers?.find((c) => c._id === customerId);

  const desiredKey = open ? (customerId ?? "new") : null;

  if (desiredKey !== loadedKey) {
    if (!open || !customerId) {
      setLoadedKey(desiredKey);
      setForm(EMPTY);
    } else if (existing) {
      setLoadedKey(desiredKey);
      setForm({
        businessName: existing.businessName,
        contactName: existing.contactName ?? "",
        email: existing.email,
        phone: existing.phone ?? "",
        address1: existing.address1,
        address2: existing.address2 ?? "",
        address3: existing.address3 ?? "",
        taxId: existing.taxId ?? "",
        tierId: existing.tierId ?? "",
        creditLimit:
          existing.creditLimit !== undefined
            ? String(existing.creditLimit)
            : "",
        paymentTermsDays:
          existing.paymentTermsDays !== undefined
            ? String(existing.paymentTermsDays)
            : "",
      });
    }
  }

  const set = (key: keyof TForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      businessName: form.businessName,
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      address1: form.address1.trim(),
      address2: form.address2.trim() || undefined,
      address3: form.address3.trim() || undefined,
      taxId: form.taxId.trim() || undefined,
      tierId: form.tierId ? (form.tierId as Id<"priceTiers">) : undefined,
      creditLimit: num(form.creditLimit),
      paymentTermsDays: num(form.paymentTermsDays),
    };

    try {
      setIsLoading(true);
      const result = customerId
        ? await updateCustomer({ customerId, ...payload })
        : await createCustomer(payload);
      toast.success(result.message);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedTiers = async () => {
    try {
      const result = await seedTiers({});
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add tiers"
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit customer" : "Add customer"}
          </DialogTitle>
          <DialogDescription>
            Stored once, then picked on every invoice instead of retyped.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Business name</Label>
              <Input
                value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)}
                placeholder="Yousuf Watch Centre"
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Contact person</Label>
              <Input
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Address</Label>
            <Input
              value={form.address1}
              onChange={(e) => set("address1", e.target.value)}
              placeholder="24 Thakkiya Road"
              required
              disabled={isLoading}
            />
            <Input
              value={form.address2}
              onChange={(e) => set("address2", e.target.value)}
              placeholder="Street name / Landmark"
              disabled={isLoading}
            />
            <Input
              value={form.address3}
              onChange={(e) => set("address3", e.target.value)}
              placeholder="City / District"
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Price tier</Label>
              <Select
                value={form.tierId}
                onValueChange={(value) => set("tierId", value)}
                disabled={isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers?.map((tier) => (
                    <SelectItem key={tier._id} value={tier._id}>
                      {tier.name}
                      {tier.discountPercent > 0
                        ? ` — ${tier.discountPercent}% off`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tiers?.length === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={handleSeedTiers}
                >
                  Add standard tiers
                </Button>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Tax / VAT no.</Label>
              <Input
                value={form.taxId}
                onChange={(e) => set("taxId", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Credit limit</Label>
              <Input
                type="number"
                min="0"
                value={form.creditLimit}
                onChange={(e) => set("creditLimit", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Payment terms (days)</Label>
              <Input
                type="number"
                min="0"
                value={form.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", e.target.value)}
                placeholder="30"
                disabled={isLoading}
              />
            </div>
          </div>

          <Button className="w-fit" disabled={isLoading}>
            {isLoading
              ? "Please wait..."
              : isEdit
                ? "Save changes"
                : "Add customer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
