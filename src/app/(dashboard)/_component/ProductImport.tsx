"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

type TRow = {
  sku: string;
  name: string;
  brandName?: string;
  categoryName?: string;
  reference?: string;
  costPrice: number;
  wholesalePrice: number;
  msrp?: number;
  trackingMode?: "QUANTITY" | "SERIAL";
  reorderPoint?: number;
};

type TResult = {
  created: number;
  updated: number;
  failed: number;
  errors: { sku: string; reason: string }[];
};

const HEADERS = [
  "sku",
  "name",
  "brand",
  "category",
  "reference",
  "cost_price",
  "wholesale_price",
  "msrp",
  "tracking_mode",
  "reorder_point",
];

/**
 * Splits one CSV line, honouring double-quoted fields so a description
 * containing a comma doesn't shift every column after it.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text: string): { rows: TRow[]; problems: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], problems: ["File has no data rows"] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const index = (name: string) => header.indexOf(name);

  const skuAt = index("sku");
  const nameAt = index("name");
  const costAt = index("cost_price");
  const wholesaleAt = index("wholesale_price");

  if (skuAt < 0 || nameAt < 0 || costAt < 0 || wholesaleAt < 0) {
    return {
      rows: [],
      problems: [
        `Missing required columns. Expected at least: sku, name, cost_price, wholesale_price`,
      ],
    };
  }

  const brandAt = index("brand");
  const categoryAt = index("category");
  const referenceAt = index("reference");
  const msrpAt = index("msrp");
  const trackingAt = index("tracking_mode");
  const reorderAt = index("reorder_point");

  const rows: TRow[] = [];
  const problems: string[] = [];

  const cell = (cells: string[], at: number): string | undefined =>
    at >= 0 ? cells[at]?.trim() || undefined : undefined;

  const numberCell = (cells: string[], at: number): number | undefined => {
    const raw = cell(cells, at);
    if (raw === undefined) return undefined;
    const parsed = Number(raw.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  lines.slice(1).forEach((line, offset) => {
    const cells = splitCsvLine(line);
    const lineNo = offset + 2;

    const sku = cell(cells, skuAt);
    const name = cell(cells, nameAt);
    const costPrice = numberCell(cells, costAt);
    const wholesalePrice = numberCell(cells, wholesaleAt);

    if (!sku || !name) {
      problems.push(`Line ${lineNo}: sku and name are required`);
      return;
    }
    if (costPrice === undefined || wholesalePrice === undefined) {
      problems.push(`Line ${lineNo}: cost_price and wholesale_price must be numbers`);
      return;
    }

    const tracking = cell(cells, trackingAt)?.toUpperCase();

    rows.push({
      sku,
      name,
      brandName: cell(cells, brandAt),
      categoryName: cell(cells, categoryAt),
      reference: cell(cells, referenceAt),
      costPrice,
      wholesalePrice,
      msrp: numberCell(cells, msrpAt),
      trackingMode: tracking === "SERIAL" ? "SERIAL" : undefined,
      reorderPoint: numberCell(cells, reorderAt),
    });
  });

  return { rows, problems };
}

export default function ProductImport() {
  const importProducts = useMutation(api.catalog.importProducts);

  const [open, setOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<TResult | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProblems([]);
    setResult(null);

    const text = await file.text();
    const { rows, problems: parseProblems } = parseCsv(text);

    setProblems(parseProblems);

    if (rows.length === 0) {
      toast.error("Nothing to import");
      return;
    }

    try {
      setIsLoading(true);
      const outcome = await importProducts({ rows });
      setResult(outcome);
      toast.success(
        `Imported ${outcome.created} new, updated ${outcome.updated}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
      // Let the same file be picked again after a correction.
      e.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Existing SKUs are updated in place, so re-importing a corrected file
            is a sync rather than a duplicate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Columns</p>
            <p className="font-mono break-all">{HEADERS.join(",")}</p>
            <p className="mt-1">
              Required: sku, name, cost_price, wholesale_price. Brands and
              categories named here are created automatically.
            </p>
          </div>

          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            disabled={isLoading}
          />

          {isLoading && <p className="text-sm">Importing...</p>}

          {problems.length > 0 && (
            <div className="text-xs text-red-500 grid gap-1 max-h-40 overflow-y-auto">
              {problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          )}

          {result && (
            <div className="text-sm grid gap-1">
              <p>
                {result.created} created, {result.updated} updated,{" "}
                {result.failed} failed
              </p>
              {result.errors.length > 0 && (
                <div className="text-xs text-red-500 grid gap-1 max-h-40 overflow-y-auto">
                  {result.errors.map((error) => (
                    <p key={error.sku}>
                      {error.sku}: {error.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
