"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronsUpDownIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

export type TPickerProduct = {
  _id: string;
  sku: string;
  name: string;
  brandId?: string;
  brandName: string;
  wholesalePrice: number;
};

const ALL_BRANDS = "ALL";

/** Cap the rendered rows — the filter is the way to find things, not scrolling. */
const MAX_RESULTS = 60;

/**
 * Searchable product picker for invoice lines.
 *
 * A flat dropdown stops working somewhere around fifty products, which is a
 * small catalog for a watch dealer. This narrows by brand first, then by free
 * text across name, SKU and brand.
 *
 * The filtering is in-memory, so there is nothing to debounce — the list is
 * already loaded. What does help at a few hundred rows is letting the input
 * stay responsive while the list re-renders, which is what useDeferredValue
 * does: no artificial delay, no dropped keystrokes.
 */
export default function ProductPicker({
  products,
  value,
  onSelect,
  disabled,
}: {
  products: TPickerProduct[] | undefined;
  value?: string;
  onSelect: (product: TPickerProduct) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [brandId, setBrandId] = useState<string>(ALL_BRANDS);

  const deferredSearch = useDeferredValue(search);
  const isStale = search !== deferredSearch;

  const selected = products?.find((p) => p._id === value);

  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of products ?? []) {
      if (product.brandId && !seen.has(product.brandId)) {
        seen.set(product.brandId, product.brandName);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const matching = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();

    return (products ?? []).filter((product) => {
      if (brandId !== ALL_BRANDS && product.brandId !== brandId) return false;
      if (!term) return true;

      // Match the three things someone actually knows: what it is called, its
      // stock code, or who makes it.
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.brandName.toLowerCase().includes(term)
      );
    });
  }, [products, brandId, deferredSearch]);

  const results = matching.slice(0, MAX_RESULTS);

  const handlePick = (product: TPickerProduct) => {
    onSelect(product);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selected
              ? `${selected.name} (${selected.sku})`
              : "Select a product..."}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(28rem,90vw)] p-2" align="start">
        <div className="grid gap-2">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANDS}>All brands</SelectItem>
              {brands.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            autoFocus
            placeholder="Search name, SKU or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div
            className={cn(
              "max-h-64 overflow-y-auto grid gap-1",
              isStale && "opacity-70"
            )}
          >
            {products === undefined && (
              <p className="text-sm text-muted-foreground p-2">Loading...</p>
            )}

            {products !== undefined && results.length === 0 && (
              <p className="text-sm text-muted-foreground p-2">
                No products match.
              </p>
            )}

            {results.map((product) => (
              <button
                key={product._id}
                type="button"
                onClick={() => handlePick(product)}
                className={cn(
                  "text-left rounded px-2 py-1.5 hover:bg-accent",
                  product._id === value && "bg-accent"
                )}
              >
                <span className="block text-sm truncate">{product.name}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {product.sku}
                  {product.brandName ? ` · ${product.brandName}` : ""}
                </span>
              </button>
            ))}
          </div>

          {matching.length > results.length && (
            <p className="text-xs text-muted-foreground">
              Showing {results.length} of {matching.length} — keep typing to
              narrow.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
