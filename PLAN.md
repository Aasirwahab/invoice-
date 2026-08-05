# Wholesale Platform Build Plan

Turning the current invoice generator into a full wholesale management system for
watches and watch accessories.

## Assumptions

These were not confirmed, so the plan is built on them. Say the word if any is wrong —
1 and 2 change the scope materially, the rest are cheap to reverse.

1. **Both audiences.** Internal back-office for your staff, plus a dealer portal where
   your retail customers log in, see their own pricing, and place orders.
2. **Mixed stock tracking.** Watches are tracked as individual serialised pieces;
   accessories (straps, batteries, boxes, tools) are tracked by quantity.
3. **Convex is the data layer.** The leftover Mongoose models and most `/api` routes are
   from an earlier migration and get retired.
4. **One company per deployment.** You are the wholesaler; this is not SaaS you resell.
   The org layer still gets built (see Phase 0) because staff accounts need it.

## The blocker nobody would notice until it's expensive

Every table today is scoped by `userId` — `invoices.by_userId`, `settings.by_userId`
([convex/schema.ts:63](convex/schema.ts:63)). That means data belongs to *a person*, not
to the business. The moment you add a second staff account, they see an empty dashboard:
their invoices, not the company's.

Every feature below inherits that scoping. Building the catalog, inventory, and orders
on `userId` and fixing it later means rewriting every query, every mutation, and
migrating live data. **It has to be Phase 0.**

## Data model

New tables, grouped by phase. Existing `users`/`invoices`/`settings` are modified, not
replaced.

### Foundation
```
organizations   name, legalName, taxId, address, defaultCurrency, logo,
                invoicePrefix, invoiceNextNo
members         orgId, clerkId, role: OWNER | MANAGER | SALES | VIEWER, status
                index: by_clerkId, by_org
```
Everything below carries `orgId` and indexes on it. `members.role` gates writes —
SALES can invoice but not change cost prices; VIEWER is read-only.

### Catalog
```
brands          orgId, name, logo, status
categories      orgId, name, kind: WATCH | STRAP | BATTERY | BOX | TOOL | OTHER
products        orgId, sku, brandId, categoryId, name, reference, description,
                images[] (Convex storage ids),
                costPrice, wholesalePrice, msrp,
                trackingMode: QUANTITY | SERIAL,
                reorderPoint, status: ACTIVE | DISCONTINUED,
                attrs: discriminated union on category kind —
                  WATCH   { caseSizeMm, movement, dialColour, caseMaterial,
                            waterResistanceM, warrantyMonths }
                  STRAP   { lugWidthMm, material, colour, length }
                  BATTERY { cellCode, voltage }
                  other   {}
                index: by_org_sku (unique), by_org_brand, by_org_category
```
Dial colour variants of the same reference get their own SKU rather than a variant
table — simpler, and wholesale pricing is per-SKU anyway.

### Inventory
```
stockLevels     orgId, productId, onHand, reserved          // QUANTITY products
stockUnits      orgId, productId, serial, status: IN_STOCK | RESERVED | SOLD |
                RETURNED | DEFECTIVE, cost, purchaseId, invoiceId?,
                warrantyUntil                                // SERIAL products
                index: by_org_serial (unique), by_product_status
stockMovements  orgId, productId, stockUnitId?, delta,
                reason: PURCHASE | SALE | RETURN | ADJUSTMENT | DAMAGE | COUNT,
                refType, refId, at, byMemberId
```
`stockMovements` is the source of truth and is append-only; `stockLevels` is a cached
projection kept in step inside the same mutation. That gives you a defensible audit
trail — when the count is wrong you can see exactly which document moved it.

### Customers & pricing
```
customers       orgId, code, businessName, contactName, email, phone,
                billingAddress, shippingAddress, taxId,
                priceTierId, creditLimit, paymentTermsDays,
                status, portalClerkId?          // set when they get a portal login
priceTiers      orgId, name, defaultDiscountPct
priceRules      orgId, priority, tierId?, customerId?, brandId?, productId?,
                mode: FIXED | DISCOUNT_PCT, value
```
Price resolution walks rules by specificity (customer+product beats tier+brand beats
tier default) and falls back to `products.wholesalePrice`.

### Trading documents
```
suppliers       orgId, name, contact, address, currency, paymentTermsDays
purchaseOrders  orgId, supplierId, poNo, status, items[], currency, fxRate,
                landedCosts[], totals
quotes          orgId, customerId, items[], validUntil, status
orders          orgId, customerId, orderNo, status: PENDING | CONFIRMED | PACKED |
                SHIPPED | COMPLETED | CANCELLED, items[], reservations
invoices        + orgId, customerId, orderId?, amountPaid, balance
                items[] gains productId, sku, serials[], unitCost (margin snapshot)
                status becomes DRAFT | SENT | PARTIAL | PAID | OVERDUE | CANCELLED
payments        orgId, invoiceId, customerId, amount, method, reference, receivedAt
returns         orgId, customerId, invoiceId, items[], reason, restock: boolean,
                status, creditNoteId?
```

## Phases

Each phase is independently shippable and has a check that proves it works. Nothing in a
later phase is needed to use an earlier one.

### Phase 0 — Tenancy foundation — DONE

`organizations` + `members` in Convex, `invoices`/`settings` re-scoped to `orgId`,
existing rows backfilled, Mongoose corpses removed.

Revised during build: **not** on Clerk Organizations. That would have needed
Organizations enabled in the Clerk dashboard plus `org_id` claims added to the Convex
JWT template — manual external config, on a plan that may bill for it. Convex-native
membership needs none of that and keeps role checks next to the data they guard.

Also settled here: `users` survives. The public PDF links already emailed to clients are
`/api/invoice/[userId]/[invoiceId]` and resolve through `v.id("users")`, so folding that
table away would 404 every invoice link already sitting in a customer's inbox. `members`
joins `users` to an org instead.

*Verify:* two staff logins under one org see the same invoice list; existing invoices
still open and still render a PDF.

### Phase 1 — Product catalog — DONE (images pending)
Brands, categories, products. List with text search, brand/category filter and
pagination; the product form swaps its attribute block based on the category kind.
CSV import creates brands and categories named in the file and updates existing SKUs in
place, so a corrected re-import is a sync rather than a duplicate.

Images are modelled (`products.images` as `_storage` ids, `generateUploadUrl` mutation)
but the upload UI is not built — see Outstanding below.

*Verify:* import a CSV of real SKUs, find one by SKU and by brand, edit it.

### Phase 2 — Dealer accounts & pricing
Customers CRUD, price tiers, price rules with a resolver. The invoice `to` block becomes
a customer picker that fills the address itself.

*Verify:* two customers on different tiers resolve different prices for the same SKU;
creating an invoice from a customer prefills correctly.

### Phase 3 — Inventory
Stock levels, serialised units, the movements ledger, manual adjustments, stock counts,
and a low-stock view driven by `reorderPoint`. Invoicing now deducts stock and, for
watches, marks specific serials `SOLD`.

*Verify:* invoice 3 units, on-hand drops by 3, ledger shows 3 SALE movements; invoicing
a serial already sold is rejected.

### Phase 4 — Invoicing upgrade
Line items come from the catalog with tier price auto-applied and margin captured.
Payments, partial balances, `OVERDUE` derivation, and a receivables aging view
(30/60/90). Credit-limit warning at invoice time.

*Verify:* a part-paid invoice shows the right balance and lands in the right aging
bucket; a customer over their credit limit is flagged.

### Phase 5 — Purchasing
Suppliers, purchase orders, goods receipt. This is where serials enter the system —
receiving a PO line for a serial-tracked watch prompts for the serial numbers. Landed
cost (freight, duty) spread across the receipt to make `costPrice` real.

*Verify:* receive a PO, stock rises, serials exist and are `IN_STOCK`, cost reflects
landed cost.

### Phase 6 — Quotes & sales orders
Quote → order → invoice conversion with stock reservation on confirmed orders, plus a
pick list for packing.

*Verify:* confirming an order moves stock to `reserved`, not `onHand`; cancelling
releases it; invoicing consumes it.

### Phase 7 — Returns & warranty
RMA against an invoice, restock or write-off, credit note. Serial lookup that shows a
watch's whole history: received on which PO, sold to which dealer, warranty expiry.

*Verify:* return a serialised watch, stock returns, credit note reduces the balance,
serial history reads correctly end to end.

### Phase 8 — Reporting
Stock valuation, margin by brand and by customer, top movers, dead stock, receivables
aging, sales trend. Replaces the current single chart.

*Verify:* numbers reconcile against the movements ledger and the payments table.

### Phase 9 — Dealer portal
Dealer login (Clerk, separate role), catalog at their own pricing, cart and order
placement into `orders` as `PENDING`, order history, statement of account, downloadable
invoices. Strictly scoped so a dealer can only ever read their own records.

*Verify:* dealer A cannot see dealer B's orders, prices, or documents by any route.

## Sequencing notes

- Phases 1–2 are independent of each other and can be built in either order.
- Phase 3 needs 1. Phase 4 needs 2 and 3. Phases 5–8 need 3. Phase 9 needs 2 and 4.
- The first genuinely useful milestone is end of Phase 4 — catalog, dealers, stock, and
  invoices that actually move stock. Phases 0–4 are the real project; 5–9 are expansion.

## Outstanding

- **Product image upload UI.** The schema, storage ids and `catalog.generateUploadUrl`
  are in place; the picker and thumbnail strip in the product form are not. Deliberately
  deferred — it is self-contained and blocks nothing in Phase 2 or 3.
- **`invoices.orgId` / `settings.orgId` are still `v.optional`.** Required for existing
  rows to survive the Phase 0 deploy. Tighten to required once the backfill has run
  against production.
- **Multi-user behaviour is untested.** Everything so far was exercised with a single
  account; the two-staff-one-org check still needs a second real sign-in.

## Working rules for implementation

- This repo runs Next.js 16 with breaking changes from training data — read the relevant
  guide in `node_modules/next/dist/docs/` before writing route/server code, per
  [AGENTS.md](AGENTS.md).
- Every new Convex table carries `orgId` and is queried through an `orgId` index. No
  exceptions, or Phase 9 becomes a security problem.
- Stock changes only ever happen by writing a `stockMovement` in the same mutation as
  the level/unit update.
