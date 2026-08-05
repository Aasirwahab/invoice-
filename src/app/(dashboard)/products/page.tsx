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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import ProductFormDialog from "../_component/ProductFormDialog";
import ProductImport from "../_component/ProductImport";
import currencyFormat from "@/lib/CurrencyFormate";

const ALL = "ALL";

export default function ProductsPage() {
  const [search, setSearch] = useState<string>("");
  const [brandId, setBrandId] = useState<string>(ALL);
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [page, setPage] = useState<number>(1);

  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<Id<"products"> | null>(null);

  const brands = useQuery(api.catalog.listBrands);
  const categories = useQuery(api.catalog.listCategories);
  const org = useQuery(api.orgs.get);

  const result = useQuery(api.catalog.listProducts, {
    search: search.trim() || undefined,
    brandId: brandId !== ALL ? (brandId as Id<"brands">) : undefined,
    categoryId: categoryId !== ALL ? (categoryId as Id<"categories">) : undefined,
    page,
  });

  const currency = org?.defaultCurrency ?? "LKR";
  const brandName = (id?: Id<"brands">) =>
    brands?.find((b) => b._id === id)?.name ?? "—";

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (productId: Id<"products">) => {
    setEditingId(productId);
    setFormOpen(true);
  };

  return (
    <div className="p-4 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-xl">Products</h1>
        <div className="flex items-center gap-2">
          <ProductImport />
          <Button onClick={openCreate}>Add product</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <Select
          value={brandId}
          onValueChange={(value) => {
            setBrandId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All brands</SelectItem>
            {brands?.map((brand) => (
              <SelectItem key={brand._id} value={brand._id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category._id} value={category._id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Wholesale</TableHead>
              <TableHead>Tracking</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result === undefined && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading products...
                </TableCell>
              </TableRow>
            )}

            {result?.data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No products yet. Add one, or import a CSV.
                </TableCell>
              </TableRow>
            )}

            {result?.data.map((product) => (
              <TableRow key={product._id}>
                <TableCell className="font-mono text-xs">
                  {product.sku}
                </TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell>{brandName(product.brandId)}</TableCell>
                <TableCell className="text-right">
                  {currencyFormat(product.costPrice, currency)}
                </TableCell>
                <TableCell className="text-right">
                  {currencyFormat(product.wholesalePrice, currency)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      product.trackingMode === "SERIAL" ? "default" : "secondary"
                    }
                  >
                    {product.trackingMode === "SERIAL" ? "Serial" : "Quantity"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(product._id)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {result && result.totalPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {result.totalCount} products
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              {result.page} / {result.totalPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= result.totalPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={editingId}
      />
    </div>
  );
}
