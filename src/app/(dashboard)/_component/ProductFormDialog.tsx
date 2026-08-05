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
import { Textarea } from "@/components/ui/textarea";
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

type TTracking = "QUANTITY" | "SERIAL";
type TMovement = "AUTOMATIC" | "QUARTZ" | "MANUAL" | "SOLAR" | "KINETIC";

type TAttrs =
  | { kind: "WATCH"; caseSizeMm?: number; movement?: TMovement; dialColour?: string; caseMaterial?: string; waterResistanceM?: number; warrantyMonths?: number }
  | { kind: "STRAP"; lugWidthMm?: number; material?: string; colour?: string; lengthMm?: number }
  | { kind: "BATTERY"; cellCode?: string; voltage?: number }
  | { kind: "GENERIC" };

type TImage = { storageId: Id<"_storage">; url: string };

type TForm = {
  sku: string;
  name: string;
  /** Free text: an existing brand name, or a new one to create on save. */
  brandName: string;
  categoryId: string;
  reference: string;
  description: string;
  costPrice: string;
  wholesalePrice: string;
  msrp: string;
  trackingMode: TTracking;
  reorderPoint: string;
};

const EMPTY: TForm = {
  sku: "",
  name: "",
  brandName: "",
  categoryId: "",
  reference: "",
  description: "",
  costPrice: "",
  wholesalePrice: "",
  msrp: "",
  trackingMode: "QUANTITY",
  reorderPoint: "",
};

/** Blank strings mean "not provided" — sending 0 would be a real price of zero. */
const num = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function ProductFormDialog({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: Id<"products"> | null;
}) {
  const brands = useQuery(api.catalog.listBrands);
  const categories = useQuery(api.catalog.listCategories);
  const existing = useQuery(
    api.catalog.getProduct,
    productId ? { productId } : "skip"
  );

  const createProduct = useMutation(api.catalog.createProduct);
  const updateProduct = useMutation(api.catalog.updateProduct);
  const generateUploadUrl = useMutation(api.catalog.generateUploadUrl);

  const [form, setForm] = useState<TForm>(EMPTY);
  const [storedAttrs, setAttrs] = useState<TAttrs>({ kind: "GENERIC" });
  const [images, setImages] = useState<TImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const isEdit = Boolean(productId);

  // Load the form for whichever product the dialog was opened for. Done during
  // render rather than in an effect: an effect would paint the previous
  // product's values for a frame before correcting itself.
  const desiredKey = open ? (productId ?? "new") : null;

  if (desiredKey !== loadedKey) {
    if (!open || !productId) {
      setLoadedKey(desiredKey);
      setForm(EMPTY);
      setAttrs({ kind: "GENERIC" });
      setImages([]);
      // `brands` is needed to turn the stored brandId back into a name, so
      // hold off until it has loaded rather than showing a blank brand.
    } else if (existing && brands) {
      setLoadedKey(desiredKey);
      setImages(
        (existing.images ?? []).flatMap((storageId, i) => {
          const url = existing.imageUrls[i];
          return url ? [{ storageId, url }] : [];
        })
      );
      setForm({
        sku: existing.sku,
        name: existing.name,
        brandName:
          brands.find((b) => b._id === existing.brandId)?.name ?? "",
        categoryId: existing.categoryId ?? "",
        reference: existing.reference ?? "",
        description: existing.description ?? "",
        costPrice: String(existing.costPrice),
        wholesalePrice: String(existing.wholesalePrice),
        msrp: existing.msrp !== undefined ? String(existing.msrp) : "",
        trackingMode: existing.trackingMode,
        reorderPoint:
          existing.reorderPoint !== undefined
            ? String(existing.reorderPoint)
            : "",
      });
      setAttrs(existing.attrs ?? { kind: "GENERIC" });
    }
  }

  // The attribute block follows the selected category's kind, so picking
  // "Straps" swaps case size and movement for lug width and material. Derived
  // rather than stored, so the two can never drift out of step.
  const selectedCategory = categories?.find((c) => c._id === form.categoryId);
  const kind = selectedCategory?.kind;
  const effectiveKind: TAttrs["kind"] =
    kind === "WATCH" || kind === "STRAP" || kind === "BATTERY"
      ? kind
      : "GENERIC";

  const attrs: TAttrs =
    storedAttrs.kind === effectiveKind
      ? storedAttrs
      : ({ kind: effectiveKind } as TAttrs);

  const set = (key: keyof TForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * Uploads straight to Convex storage and keeps only the returned id. The
   * file never passes through a mutation argument, so catalog photographs are
   * not bounded by the document size limit.
   */
  const handleImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    try {
      setIsUploading(true);

      for (const file of files) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) throw new Error(`Upload failed for ${file.name}`);

        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };

        setImages((current) => [
          ...current,
          { storageId, url: URL.createObjectURL(file) },
        ]);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload image"
      );
    } finally {
      setIsUploading(false);
      // Allow re-picking the same file after a failure.
      e.target.value = "";
    }
  };

  const removeImage = (storageId: Id<"_storage">) =>
    setImages((current) => current.filter((i) => i.storageId !== storageId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const costPrice = num(form.costPrice);
    const wholesalePrice = num(form.wholesalePrice);

    if (costPrice === undefined || wholesalePrice === undefined) {
      toast.error("Cost price and wholesale price are required");
      return;
    }

    const payload = {
      sku: form.sku,
      name: form.name,
      // Sent as a name, not an id — the server matches an existing brand or
      // creates it in the same transaction as the product.
      brandName: form.brandName.trim(),
      categoryId: form.categoryId
        ? (form.categoryId as Id<"categories">)
        : undefined,
      images: images.map((i) => i.storageId),
      reference: form.reference.trim() || undefined,
      description: form.description.trim() || undefined,
      costPrice,
      wholesalePrice,
      msrp: num(form.msrp),
      trackingMode: form.trackingMode,
      reorderPoint: num(form.reorderPoint),
      attrs,
    };

    try {
      setIsLoading(true);
      const result = productId
        ? await updateProduct({ productId, ...payload })
        : await createProduct(payload);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this SKU's details and pricing."
              : "Add a watch or accessory to your catalog."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="SEIKO-SKX007"
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Seiko SKX007 Diver"
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label>Brand</Label>
              {/* Free text backed by a datalist: pick an existing brand or
                  type a new one, which is created when the product saves. */}
              <Input
                list="brand-options"
                value={form.brandName}
                onChange={(e) => set("brandName", e.target.value)}
                placeholder="Seiko — or type a new brand"
                disabled={isLoading}
              />
              <datalist id="brand-options">
                {brands?.map((brand) => (
                  <option key={brand._id} value={brand.name} />
                ))}
              </datalist>
              {form.brandName.trim() &&
                brands &&
                !brands.some(
                  (b) =>
                    b.name.trim().toLowerCase() ===
                    form.brandName.trim().toLowerCase()
                ) && (
                  <p className="text-xs text-muted-foreground">
                    New brand — will be created on save.
                  </p>
                )}
            </div>

            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => set("categoryId", value)}
                disabled={isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category) => (
                    <SelectItem key={category._id} value={category._id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No categories yet — add the defaults under Settings &gt;
                  Brands &amp; Categories.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Reference no.</Label>
              <Input
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
                placeholder="SKX007J1"
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label>Stock tracking</Label>
              <Select
                value={form.trackingMode}
                onValueChange={(value) =>
                  set("trackingMode", value as TTracking)
                }
                disabled={isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUANTITY">
                    Quantity — count on hand
                  </SelectItem>
                  <SelectItem value="SERIAL">
                    Serial — track each piece
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <Label>Cost price</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.costPrice}
                onChange={(e) => set("costPrice", e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Wholesale</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.wholesalePrice}
                onChange={(e) => set("wholesalePrice", e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>MSRP</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.msrp}
                onChange={(e) => set("msrp", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label>Reorder at</Label>
              <Input
                type="number"
                min="0"
                value={form.reorderPoint}
                onChange={(e) => set("reorderPoint", e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {attrs.kind === "WATCH" && (
            <div className="grid gap-4 sm:grid-cols-3 border-t pt-4">
              <div className="grid gap-2">
                <Label>Case size (mm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={attrs.caseSizeMm ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, caseSizeMm: num(e.target.value) })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Movement</Label>
                <Select
                  value={attrs.movement ?? ""}
                  onValueChange={(value) =>
                    setAttrs({ ...attrs, movement: value as TMovement })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {["AUTOMATIC", "QUARTZ", "MANUAL", "SOLAR", "KINETIC"].map(
                      (option) => (
                        <SelectItem key={option} value={option}>
                          {option.charAt(0) + option.slice(1).toLowerCase()}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Dial colour</Label>
                <Input
                  value={attrs.dialColour ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, dialColour: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Case material</Label>
                <Input
                  value={attrs.caseMaterial ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, caseMaterial: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Water resistance (m)</Label>
                <Input
                  type="number"
                  value={attrs.waterResistanceM ?? ""}
                  onChange={(e) =>
                    setAttrs({
                      ...attrs,
                      waterResistanceM: num(e.target.value),
                    })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Warranty (months)</Label>
                <Input
                  type="number"
                  value={attrs.warrantyMonths ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, warrantyMonths: num(e.target.value) })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {attrs.kind === "STRAP" && (
            <div className="grid gap-4 sm:grid-cols-4 border-t pt-4">
              <div className="grid gap-2">
                <Label>Lug width (mm)</Label>
                <Input
                  type="number"
                  value={attrs.lugWidthMm ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, lugWidthMm: num(e.target.value) })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Material</Label>
                <Input
                  value={attrs.material ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, material: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Colour</Label>
                <Input
                  value={attrs.colour ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, colour: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Length (mm)</Label>
                <Input
                  type="number"
                  value={attrs.lengthMm ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, lengthMm: num(e.target.value) })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {attrs.kind === "BATTERY" && (
            <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
              <div className="grid gap-2">
                <Label>Cell code</Label>
                <Input
                  value={attrs.cellCode ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, cellCode: e.target.value })
                  }
                  placeholder="SR626SW"
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label>Voltage</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={attrs.voltage ?? ""}
                  onChange={(e) =>
                    setAttrs({ ...attrs, voltage: num(e.target.value) })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="grid gap-2 border-t pt-4">
            <Label>Images</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImages}
              disabled={isLoading || isUploading}
            />
            {isUploading && (
              <p className="text-xs text-muted-foreground">Uploading...</p>
            )}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((image) => (
                  <div key={image.storageId} className="relative">
                    {/* Convex storage URLs are signed and not a configured
                        next/image remote host, so a plain img is correct. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt="Product"
                      className="h-20 w-20 rounded border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.storageId)}
                      className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-black text-xs text-white"
                      aria-label="Remove image"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              disabled={isLoading}
            />
          </div>

          <Button className="w-fit" disabled={isLoading}>
            {isLoading ? "Please wait..." : isEdit ? "Save changes" : "Add product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
