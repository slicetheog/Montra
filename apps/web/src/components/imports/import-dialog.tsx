"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { useCancelImport, useCommitImport, useImportPreview, useStageImport, useUpdateImportRow } from "@/hooks/use-imports";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";
import { ApiRequestError } from "@/lib/api-client";
import { parseDecimalToCents } from "@montra/domain";

type Step = "upload" | "map" | "preview";

export function ImportDialog({ open, onOpenChange, budgetId }: { open: boolean; onOpenChange: (open: boolean) => void; budgetId: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState("");
  const [payeeCol, setPayeeCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [memoCol, setMemoCol] = useState("__none__");
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();
  const [importId, setImportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accounts = useAccounts(budgetId);
  const categories = useCategories(budgetId);
  const stageImport = useStageImport(budgetId);
  const preview = useImportPreview(budgetId, importId);
  const updateRow = useUpdateImportRow(budgetId, importId);
  const commitImport = useCommitImport(budgetId);
  const cancelImport = useCancelImport(budgetId);

  const flatCategories = categories.data?.flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name }))) ?? [];

  function reset() {
    setStep("upload");
    setFile(null);
    setCsvRows([]);
    setHeaders([]);
    setImportId(null);
    setError(null);
  }

  function handleFile(selected: File) {
    setFile(selected);
    Papa.parse<Record<string, string>>(selected, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvRows(results.data);
        setHeaders(results.meta.fields ?? []);
        // Best-effort auto-detect common header names.
        const find = (candidates: string[]) => results.meta.fields?.find((f) => candidates.includes(f.toLowerCase().trim()));
        setDateCol(find(["date"]) ?? "");
        setPayeeCol(find(["payee", "description", "name"]) ?? "");
        setAmountCol(find(["amount"]) ?? "");
        setMemoCol(find(["memo", "notes"]) ?? "__none__");
        setStep("map");
      },
      error: () => setError("Couldn't read that file. Please check it's a valid CSV."),
    });
  }

  async function submitMapping() {
    setError(null);
    if (!accountId) return setError("Choose which account this is for.");
    if (!dateCol || !payeeCol || !amountCol) return setError("Map at least Date, Payee, and Amount.");

    try {
      const rows = csvRows
        .map((row) => {
          const amountRaw = row[amountCol]?.trim();
          if (!amountRaw) return null;
          return {
            date: row[dateCol],
            payee: row[payeeCol] || "Unknown",
            amountCents: parseDecimalToCents(amountRaw),
            memo: memoCol !== "__none__" ? row[memoCol] : undefined,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const result = await stageImport.mutateAsync({ accountId, filename: file?.name ?? "import.csv", rows });
      setImportId(result.id);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't stage that import. Check your column mapping and try again.");
    }
  }

  async function handleCommit() {
    if (!importId) return;
    try {
      const result = await commitImport.mutateAsync(importId);
      toast.success(`Imported ${result.importedCount} transaction${result.importedCount === 1 ? "" : "s"}.`);
      onOpenChange(false);
      reset();
    } catch {
      toast.error("Couldn't finish the import. Please try again.");
    }
  }

  async function handleCancel() {
    if (importId) await cancelImport.mutateAsync(importId).catch(() => {});
    onOpenChange(false);
    reset();
  }

  const willImportCount = preview.data?.rows.filter((r) => r.willImport).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import transactions</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV export from your bank."}
            {step === "map" && "Tell us which columns are which."}
            {step === "preview" && "Review before we add anything — nothing is imported yet."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="csv-file">CSV file</Label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="text-sm"
              />
            </div>
            {error && <p className="text-sm text-negative">{error}</p>}
          </div>
        )}

        {step === "map" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <ColumnSelect label="Date column" value={dateCol} onChange={setDateCol} headers={headers} />
              <ColumnSelect label="Payee column" value={payeeCol} onChange={setPayeeCol} headers={headers} />
              <ColumnSelect label="Amount column" value={amountCol} onChange={setAmountCol} headers={headers} />
              <ColumnSelect label="Memo column (optional)" value={memoCol} onChange={setMemoCol} headers={headers} allowNone />
            </div>
            <p className="text-xs text-foreground-muted">{csvRows.length} rows found in {file?.name}.</p>
            {error && <p className="text-sm text-negative">{error}</p>}
          </div>
        )}

        {step === "preview" && preview.data && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground-muted">
              {willImportCount} of {preview.data.rows.length} rows will be imported.{" "}
              {preview.data.rows.some((r) => r.isDuplicate) && "Likely duplicates are pre-unchecked — review before including them."}
            </p>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              {preview.data.rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 border-b border-border p-2.5 last:border-b-0">
                  <Checkbox
                    checked={row.willImport}
                    onCheckedChange={(v) => updateRow.mutate({ rowId: row.id, patch: { willImport: v === true } })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{row.rawPayeeText}</span>
                      {row.isDuplicate && <Badge variant="caution">Possible duplicate</Badge>}
                    </div>
                    <p className="text-xs text-foreground-muted">{formatDate(row.rawDate)}</p>
                  </div>
                  <Select
                    value={row.matchedCategoryId ?? "none"}
                    onValueChange={(v) => updateRow.mutate({ rowId: row.id, patch: { matchedCategoryId: v === "none" ? null : v } })}
                  >
                    <SelectTrigger className="w-40 shrink-0">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {flatCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums">{formatCents(row.rawAmountCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          {step === "map" && (
            <Button onClick={submitMapping} disabled={stageImport.isPending}>
              {stageImport.isPending ? "Checking…" : "Preview import"}
            </Button>
          )}
          {step === "preview" && (
            <Button onClick={handleCommit} disabled={commitImport.isPending || willImportCount === 0}>
              {commitImport.isPending ? "Importing…" : `Import ${willImportCount} transaction${willImportCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnSelect({
  label,
  value,
  onChange,
  headers,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  headers: string[];
  allowNone?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a column" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="__none__">None</SelectItem>}
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
