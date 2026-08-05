"use client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { InvoiceSchemaZod } from "@/lib/zodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, DeleteIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import ProductPicker from "./ProductPicker";

interface ICreateEditInvoice {
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined | null;
  currency?: string | undefined;
  invoiceId?: string | undefined; //for edit section
}

export default function CreateEditInvoice({
  firstName,
  lastName,
  email,
  currency,
  invoiceId, //
}: ICreateEditInvoice) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues,
    control,
    reset,
  } = useForm<z.infer<typeof InvoiceSchemaZod>>({
    resolver: zodResolver(InvoiceSchemaZod),
    defaultValues: {
      items: [
        {
          item_name: "",
          quantity: 0,
          price: 0,
          total: 0,
        },
      ],
      from: {
        name: `${firstName} ${lastName}`,
        email: email as string,
      },
      tax_percentage: 0,
      currency: currency,
      discount: 0,
      sub_total: 0,
      total: 0,
    },
  });
  const customers = useQuery(api.customers.list, {});
  const products = useQuery(api.catalog.listForPicker);
  // Only needed when raising a new invoice — an edit keeps its own number.
  const suggestedNumber = useQuery(
    api.invoices.nextNumber,
    invoiceId ? "skip" : {}
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const activeCustomer = customers?.find((c) => c._id === selectedCustomerId);
  const activeTier = activeCustomer?.tier ?? null;

  /** Wholesale price less the customer's tier discount. */
  const priceFor = (wholesalePrice: number): number => {
    const discount = activeTier?.discountPercent ?? 0;
    // Rounded to whole currency units — LKR is not quoted in fractions.
    return Math.round(wholesalePrice * (1 - discount / 100));
  };

  /**
   * Copies the dealer's stored address onto the invoice and re-prices any
   * catalog lines already added, since the tier may differ from the last
   * customer selected.
   */
  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);

    const customer = customers?.find((c) => c._id === customerId);
    if (!customer) return;

    setValue("to.name", customer.businessName, { shouldValidate: true });
    setValue("to.email", customer.email, { shouldValidate: true });
    setValue("to.address1", customer.address1, { shouldValidate: true });
    setValue("to.address2", customer.address2 ?? "");
    setValue("to.address3", customer.address3 ?? "");

    const discount = customer.tier?.discountPercent ?? 0;
    getValues("items").forEach((item, index) => {
      const product = products?.find((p) => p._id === item.productId);
      if (!product) return;
      setValue(
        `items.${index}.price`,
        Math.round(product.wholesalePrice * (1 - discount / 100))
      );
    });
  };

  /** Fills a line from the catalog at the current customer's tier price. */
  const handleSelectProduct = (index: number, productId: string) => {
    const product = products?.find((p) => p._id === productId);
    if (!product) return;

    setValue(`items.${index}.productId`, productId);
    setValue(`items.${index}.sku`, product.sku);
    setValue(`items.${index}.item_name`, product.name, {
      shouldValidate: true,
    });
    setValue(`items.${index}.price`, priceFor(product.wholesalePrice));

    if (!getValues(`items.${index}.quantity`)) {
      setValue(`items.${index}.quantity`, 1);
    }
  };
  const router = useRouter();

  const createInvoice = useMutation(api.invoices.create);
  const updateInvoice = useMutation(api.invoices.update);

  //"skip" means the query does not run at all on the create screen
  const existingInvoice = useQuery(
    api.invoices.getById,
    invoiceId ? { invoiceId: invoiceId as Id<"invoices"> } : "skip"
  );

  //edit component — Convex stores dates as epoch ms, the form wants Date objects
  useEffect(() => {
    if (!existingInvoice) return;
    reset({
      ...existingInvoice,
      invoice_date: new Date(existingInvoice.invoice_date),
      due_date: new Date(existingInvoice.due_date),
    });
    // Restore the picker too, or saving an edit would drop the customer link.
    setSelectedCustomerId(existingInvoice.customerId ?? "");
  }, [existingInvoice, reset]);

  //prefill the next number on a new invoice, without overwriting a typed one
  useEffect(() => {
    if (!suggestedNumber) return;
    if (getValues("invoice_no")) return;
    setValue("invoice_no", suggestedNumber);
  }, [suggestedNumber, getValues, setValue]);

  //items
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  //total of items
  const items = watch("items");
  useEffect(() => {
    items.forEach((item, index) => {
      const quantity = parseFloat(item.quantity.toString()) || 0;
      const price = parseFloat(item.price.toString()) || 0;

      const total = quantity * price;

      // console.log(total);
      setValue(`items.${index}.total`, total);
    });
    const sub_total = items.reduce((preve, curr) => preve + curr.total, 0);
    setValue("sub_total", sub_total);
  }, [JSON.stringify(items), setValue]);

  //add new item row
  const handleAddNewItemRow = (e: any) => {
    e.preventDefault();
    append({
      item_name: "",
      quantity: 0,
      price: 0,
      total: 0,
    });
  };
  //remove item row
  const handleRemoveItem = (index: number) => {
    remove(index);
  };

  //form -> Convex: Date objects become epoch ms, and currency is required
  const toInvoiceArgs = (data: z.infer<typeof InvoiceSchemaZod>) => ({
    invoice_no: data.invoice_no,
    invoice_date: data.invoice_date.getTime(),
    due_date: data.due_date.getTime(),
    currency: data.currency ?? currency ?? "LKR",
    customerId: selectedCustomerId
      ? (selectedCustomerId as Id<"customers">)
      : undefined,
    from: data.from,
    to: data.to,
    // Catalog lines carry the product they came from; typed lines don't.
    items: data.items.map((item) => ({
      item_name: item.item_name,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      productId: item.productId
        ? (item.productId as Id<"products">)
        : undefined,
      sku: item.sku,
    })),
    sub_total: data.sub_total,
    discount: data.discount,
    tax_percentage: data.tax_percentage,
    total: data.total,
    notes: data.notes,
  });

  const onSubmit = async (data: z.infer<typeof InvoiceSchemaZod>) => {
    //for create invoice
    if (!invoiceId) {
      try {
        setIsLoading(true);
        //the form has no status field, so new invoices start UNPAID
        const result = await createInvoice({
          ...toInvoiceArgs(data),
          status: "UNPAID",
        });
        toast.success(result.message);
        router.push("/invoice");
      } catch (error) {
        console.log(error);
        toast.error("Something went wrong");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    //for edit invoice — status is omitted so an existing PAID stays PAID
    try {
      setIsLoading(true);
      await updateInvoice({
        invoiceId: invoiceId as Id<"invoices">,
        ...toInvoiceArgs(data),
      });
      toast.success("Invoice updated Successfully");
      router.push("/invoice")
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const sub_total = watch("sub_total") || 0;
  const discount = watch("discount") || 0;
  const sub_totalRemoveDiscount = sub_total - discount;
  const taxAmount =
    (sub_totalRemoveDiscount * watch("tax_percentage")) / 100 || 0;
  //tax is added to what the customer owes, not taken off it
  const totalAmount = sub_totalRemoveDiscount + taxAmount;

  useEffect(() => {
    setValue("total", totalAmount);
  }, [totalAmount]);

  const totalAmountInCurrencyFormat = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || watch("currency") || "INR",
  }).format(totalAmount);

  return (
    <form
      className="grid py-4 gap-4 lg:gap-6"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="grid grid-cols-2 gap-4 lg:gap-6">
        <div className="grid">
          <div className="flex items-center">
            <div className="min-w-9 min-h-9 text-center border h-full flex justify-center items-center bg-neutral-100 rounded-l-md ">
              #
            </div>
            <Input
              type="text"
              placeholder="Invoice No."
              className="rounded-l-none"
              {...register("invoice_no", { required: true })}
              disabled={isLoading}
            />
          </div>
          {errors?.invoice_no && (
            <p className="text-xs text-red-500">{errors.invoice_no.message}</p>
          )}
        </div>

        <div></div>

        <div className="grid">
          <div className="flex items-center">
            <div className="min-w-9 min-h-9 text-center border h-full flex justify-center items-center bg-neutral-100 rounded-l-md ">
              <CalendarIcon className="size-4" />
            </div>
            <Popover>
              <PopoverTrigger className="w-full" asChild>
                <Button
                  type="button"
                  variant={"outline"}
                  className={cn(
                    "pl-3 text-left font-normal",
                    !getValues("invoice_date") && "text-muted-foreground",
                    "justify-start font-normal rounded-l-none flex-1 w-full "
                  )}
                  disabled={isLoading}
                >
                  {getValues("invoice_date") ? (
                    format(getValues("invoice_date"), "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <Calendar
                  mode="single"
                  selected={getValues("invoice_date")}
                  onSelect={(date) => {
                    setValue("invoice_date", date as Date, {
                      shouldValidate: true,
                    });
                  }}
                  disabled={(date) =>
                    date > new Date() || date < new Date("1900-01-01")
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
          {errors?.invoice_date && (
            <p className="text-xs text-red-500">
              {errors.invoice_date.message}
            </p>
          )}
        </div>

        <div className="grid">
          <div className="flex items-center">
            <div className="min-w-9 min-h-9 text-center border h-full flex justify-center items-center bg-neutral-100 rounded-l-md ">
              <CalendarIcon className="size-4" />
            </div>
            <Popover>
              <PopoverTrigger className="w-full" asChild>
                <Button
                  type="button"
                  variant={"outline"}
                  className={cn(
                    "pl-3 text-left font-normal",
                    !watch("due_date") && "text-muted-foreground",
                    "justify-start font-normal rounded-l-none flex-1 w-full "
                  )}
                  disabled={isLoading}
                >
                  {watch("due_date") ? (
                    format(watch("due_date"), "PPP")
                  ) : (
                    <span>Due date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <Calendar
                  mode="single"
                  selected={watch("due_date")}
                  onSelect={(date) => {
                    setValue("due_date", date as Date, {
                      shouldValidate: true,
                    });
                  }}
                  disabled={(date) =>
                    date < new Date() || date < new Date("1900-01-01")
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
          {errors?.due_date && (
            <p className="text-xs text-red-500">{errors.due_date.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:gap-6">
        {/**from (current user details) */}
        <div className="grid gap-2">
          <Label>From</Label>
          <div>
            <Input
              type="text"
              placeholder="From name"
              {...register("from.name", { required: true })}
              disabled={isLoading}
            />
            {errors.from?.name && (
              <p className="text-xs text-red-500">{errors.from.name.message}</p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="joe@example.com"
              {...register("from.email", { required: true })}
              disabled={isLoading}
            />
            {errors.from?.email && (
              <p className="text-xs text-red-500">
                {errors.from.email.message}
              </p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="Bldg No. / Flat No. / Shop No. / Building Name"
              {...register("from.address1", { required: true })}
              disabled={isLoading}
            />
            {errors.from?.address1 && (
              <p className="text-xs text-red-500">
                {errors.from.address1.message}
              </p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="Street name / Landmark"
              {...register("from.address2", { required: true })}
              disabled={isLoading}
            />
            {errors.from?.address2 && (
              <p className="text-xs text-red-500">
                {errors.from.address2.message}
              </p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="City / State / Country / Pincode "
              {...register("from.address3", { required: true })}
              disabled={isLoading}
            />
            {errors.from?.address3 && (
              <p className="text-xs text-red-500">
                {errors.from.address3.message}
              </p>
            )}
          </div>
        </div>

        {/**to (client details) */}
        <div className="grid gap-2">
          <Label>To</Label>

          {/* Picking a dealer fills the address below and prices every line at
              their tier. The fields stay editable: `to` is what actually gets
              printed, so a one-off delivery address must still be possible. */}
          <Select
            value={selectedCustomerId}
            onValueChange={handleSelectCustomer}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a customer, or type below" />
            </SelectTrigger>
            <SelectContent>
              {customers?.map((customer) => (
                <SelectItem key={customer._id} value={customer._id}>
                  {customer.businessName}
                  {customer.tier ? ` — ${customer.tier.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customers?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No customers yet — add them under Customers to stop retyping.
            </p>
          )}
          {activeTier && activeTier.discountPercent > 0 && (
            <p className="text-xs text-muted-foreground">
              {activeTier.name}: prices are {activeTier.discountPercent}% off
              wholesale.
            </p>
          )}

          <div>
            <Input
              type="text"
              placeholder="To name"
              {...register("to.name", { required: true })}
              disabled={isLoading}
            />
            {errors.to?.name && (
              <p className="text-xs text-red-500">{errors.to.name.message}</p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="joe@example.com"
              {...register("to.email", { required: true })}
              disabled={isLoading}
            />
            {errors.to?.email && (
              <p className="text-xs text-red-500">{errors.to.email.message}</p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="Bldg No. / Flat No. / Shop No. / Building Name"
              {...register("to.address1", { required: true })}
              disabled={isLoading}
            />
            {errors.to?.address1 && (
              <p className="text-xs text-red-500">
                {errors.to.address1.message}
              </p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="Street name / Landmark"
              {...register("to.address2", { required: true })}
              disabled={isLoading}
            />
            {errors.to?.address2 && (
              <p className="text-xs text-red-500">
                {errors.to.address2.message}
              </p>
            )}
          </div>
          <div>
            <Input
              type="text"
              placeholder="City / State / Country / Pincode "
              {...register("to.address3", { required: true })}
              disabled={isLoading}
            />
            {errors.to?.address3 && (
              <p className="text-xs text-red-500">
                {errors.to.address3.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/**item details */}
      <div className="grid gap-2">
        <div className="grid grid-cols-6 bg-neutral-50 py-1 px-1 gap-2">
          <div className="col-span-3">Item</div>
          <div>Quantity</div>
          <div>Price</div>
          <div>Total</div>
        </div>

        {fields.map((item, index) => {
          return (
            <div className="grid grid-cols-6 gap-2" key={index}>
              <div className="col-span-3 grid gap-1">
                {/* Pick from the catalog and the name, SKU and tier price all
                    fill in. The text field below stays authoritative, so a
                    one-off line that is not a stocked product still works. */}
                <ProductPicker
                  products={products}
                  value={watch(`items.${index}.productId`)}
                  onSelect={(product) => handleSelectProduct(index, product._id)}
                  disabled={isLoading}
                />
                <Input
                  placeholder="or type a custom item"
                  type="text"
                  {...register(`items.${index}.item_name`, { required: true })}
                  disabled={isLoading}
                />
                {errors.items && errors.items[index]?.item_name && (
                  <p className="text-xs text-red-500">
                    {errors.items[index]?.item_name.message}
                  </p>
                )}
              </div>
              <div>
                <Input
                  placeholder="Enter quantity"
                  {...register(`items.${index}.quantity`, {
                    required: true,
                    valueAsNumber: true,
                  })}
                  type="number"
                  disabled={isLoading}
                />
                {errors.items && errors.items[index]?.quantity && (
                  <p className="text-xs text-red-500">
                    {errors.items[index]?.quantity.message}
                  </p>
                )}
              </div>
              <div>
                <Input
                  placeholder="Enter price"
                  {...register(`items.${index}.price`, {
                    required: true,
                    valueAsNumber: true,
                  })}
                  type="number"
                  disabled={isLoading}
                />
                {errors.items && errors.items[index]?.price && (
                  <p className="text-xs text-red-500">
                    {errors.items[index]?.price.message}
                  </p>
                )}
              </div>
              <div className="relative ">
                <Input
                  placeholder="Enter total"
                  {...register(`items.${index}.total`, {
                    required: true,
                    valueAsNumber: true,
                  })}
                  type="number"
                  disabled
                />
                {errors.items && errors.items[index]?.total && (
                  <p className="text-xs text-red-500">
                    {errors.items[index]?.total.message}
                  </p>
                )}
                {index !== 0 && (
                  <div className="absolute top-0 right-0">
                    <Button
                      type="button"
                      variant={"ghost"}
                      size={"icon"}
                      className="bg-red-50 text-red-500"
                      onClick={() => handleRemoveItem(index)}
                      disabled={isLoading}
                    >
                      <DeleteIcon />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          disabled={isLoading}
          className="w-fit"
          onClick={handleAddNewItemRow}
        >
          Add Item
        </Button>
      </div>

      {/**sub total , discount, tax, total */}
      <div>
        <div className="max-w-sm w-full ml-auto grid gap-2">
          <div className="grid grid-cols-2">
            <Label>Sub total : </Label>
            <Input
              disabled
              placeholder="Sub total"
              type="number"
              {...register("sub_total", { valueAsNumber: true })}
            />
          </div>
          <div className="grid grid-cols-2">
            <Label>Discount : </Label>
            <Input
              placeholder="discount"
              type="number"
              {...register("discount", { valueAsNumber: true })}
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-2">
            <Label> </Label>
            <Input
              placeholder="Sub total"
              type="number"
              value={sub_totalRemoveDiscount ?? ""}
              disabled
            />
          </div>
          <div className="grid grid-cols-2">
            <Label>
              Tax:{" "}
              <Input
                placeholder="%"
                type="text"
                className="min-w-14 w-14 max-w-14"
                {...register("tax_percentage", { valueAsNumber: true })}
                disabled={isLoading}
              />
              %{" "}
            </Label>
            <Input
              placeholder="tax amount"
              type="number"
              value={taxAmount}
              disabled
            />
            {errors.tax_percentage && (
              <p className="text-xs text-red-500 block">
                {errors.tax_percentage.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2">
            <Label>Total</Label>
            <Input
              placeholder="Total"
              type="number"
              className="font-semibold"
              // value={totalAmount ?? ""}
              disabled
              {...register("total", { valueAsNumber: true })}
            />
          </div>
          <div className="flex items-center justify-center min-h-14 font-bold text-lg">
            {totalAmountInCurrencyFormat}
          </div>
        </div>
      </div>

      {/**notes */}
      <div className="grid gap-2 max-w-xl">
        <Label>Notes:</Label>
        <Textarea
          disabled={isLoading}
          placeholder="Enter your notes"
          {...register("notes")}
        />
      </div>

      <Button size={"lg"}>
        {isLoading ? "Please wait..." : invoiceId ? "Update Invoice" : "Create Invoice"}
      </Button>
    </form>
  );
}
