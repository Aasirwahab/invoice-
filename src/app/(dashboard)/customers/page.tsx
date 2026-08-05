"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import CustomerFormDialog from "../_component/CustomerFormDialog";

export default function CustomersPage() {
  const [search, setSearch] = useState<string>("");
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);

  const customers = useQuery(api.customers.list, {
    search: search.trim() || undefined,
  });

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  return (
    <div className="p-4 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-xl">Customers</h1>
        <Button onClick={openCreate}>Add customer</Button>
      </div>

      <Input
        className="max-w-xs"
        placeholder="Search by business name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            {/* Contact and terms fold into the business cell on a phone. */}
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="hidden lg:table-cell">Terms</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers === undefined && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Loading customers...
                </TableCell>
              </TableRow>
            )}

            {customers?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  No customers yet. Add one to stop retyping addresses.
                </TableCell>
              </TableRow>
            )}

            {customers?.map((customer) => (
              <TableRow key={customer._id}>
                <TableCell>
                  <div className="grid">
                    <span className="font-medium">{customer.businessName}</span>
                    <span className="text-xs text-muted-foreground">
                      {customer.address1}
                    </span>
                    <span className="md:hidden text-xs text-muted-foreground">
                      {customer.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="grid">
                    <span>{customer.contactName ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {customer.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {customer.tier ? (
                    <Badge variant="secondary">
                      {customer.tier.name}
                      {customer.tier.discountPercent > 0
                        ? ` -${customer.tier.discountPercent}%`
                        : ""}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {customer.paymentTermsDays
                    ? `${customer.paymentTermsDays} days`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingId(customer._id);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customerId={editingId}
      />
    </div>
  );
}
