"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type TKind = "WATCH" | "STRAP" | "BATTERY" | "BOX" | "TOOL" | "OTHER";

const KINDS: { value: TKind; label: string }[] = [
  { value: "WATCH", label: "Watches" },
  { value: "STRAP", label: "Straps" },
  { value: "BATTERY", label: "Batteries" },
  { value: "BOX", label: "Boxes" },
  { value: "TOOL", label: "Tools" },
  { value: "OTHER", label: "Other" },
];

/**
 * Brands and categories. A category's `kind` decides which attribute fields
 * the product form shows, so it is the one field here that actually changes
 * behaviour rather than just labelling.
 */
export default function CatalogSettings() {
  const brands = useQuery(api.catalog.listBrands);
  const categories = useQuery(api.catalog.listCategories);
  const createBrand = useMutation(api.catalog.createBrand);
  const createCategory = useMutation(api.catalog.createCategory);
  const seedDefaults = useMutation(api.catalog.seedDefaults);

  const [brandName, setBrandName] = useState<string>("");
  const [categoryName, setCategoryName] = useState<string>("");
  const [categoryKind, setCategoryKind] = useState<TKind>("WATCH");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const result = await createBrand({ name: brandName });
      toast.success(result.message);
      setBrandName("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const result = await createCategory({
        name: categoryName,
        kind: categoryKind,
      });
      toast.success(result.message);
      setCategoryName("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeed = async () => {
    try {
      setIsLoading(true);
      const result = await seedDefaults({});
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Start from a standard list</p>
          <p className="text-xs text-muted-foreground">
            Adds common watch brands and the six category types. Skips anything
            you already have, so it is safe to run again.
          </p>
        </div>
        <Button variant="outline" onClick={handleSeed} disabled={isLoading}>
          {isLoading ? "Please wait..." : "Add defaults"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
      <div className="grid gap-3">
        <p className="text-sm font-medium">Brands</p>
        <form className="flex gap-2" onSubmit={handleAddBrand}>
          <Input
            placeholder="Seiko"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            required
            disabled={isLoading}
          />
          <Button disabled={isLoading}>Add</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {brands?.length === 0 && (
            <p className="text-sm text-muted-foreground">No brands yet.</p>
          )}
          {brands?.map((brand) => (
            <Badge key={brand._id} variant="secondary">
              {brand.name}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <p className="text-sm font-medium">Categories</p>
        <form className="grid gap-2" onSubmit={handleAddCategory}>
          <Input
            placeholder="Dive watches"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
            disabled={isLoading}
          />
          <div className="flex gap-2">
            <Select
              value={categoryKind}
              onValueChange={(value) => setCategoryKind(value as TKind)}
              disabled={isLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((kind) => (
                  <SelectItem key={kind.value} value={kind.value}>
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={isLoading}>Add</Button>
          </div>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories?.length === 0 && (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
          {categories?.map((category) => (
            <Badge key={category._id} variant="secondary">
              {category.name}
            </Badge>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
