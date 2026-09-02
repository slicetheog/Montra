"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, Upload, Archive } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { useHasHydrated } from "@/hooks/use-hydrated";
import { useCreateBudget, useArchiveBudget, useDeleteBudget, useRenameBudget, useUpdateSettings } from "@/hooks/use-settings";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RemoveAdsCard } from "@/components/settings/remove-ads-card";
import { ImportDialog } from "@/components/imports/import-dialog";
import { AdBanner } from "@/components/ads/ad-banner";
import { api, ApiRequestError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function SettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { budgetId } = useCurrentBudget();
  const updateSettings = useUpdateSettings();

  const [tab, setTab] = useState(searchParams.get("tab") ?? "profile");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold">Settings</h1>
        <p className="mb-6 text-sm text-foreground-muted">Manage your account, budgets, and data.</p>

        <div className="mb-6">
          <RemoveAdsCard />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileSection />
          </TabsContent>

          <TabsContent value="budgets">
            <BudgetsSection />
          </TabsContent>

          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Currency, dates, and appearance.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Currency</Label>
                    <Select
                      value={me?.settings?.currency ?? "USD"}
                      onValueChange={(v) => updateSettings.mutate({ currency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["USD", "EUR", "GBP", "CAD", "AUD", "JPY"].map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-foreground-muted">
                      Applies to new budgets you create — an existing budget keeps the currency it was created with.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Date format</Label>
                    <Select
                      value={me?.settings?.dateFormat ?? "MM/DD/YYYY"}
                      onValueChange={(v) => updateSettings.mutate({ dateFormat: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>First day of month (for budget periods)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    className="w-24"
                    value={me?.settings?.firstDayOfMonth ?? 1}
                    onChange={(e) => updateSettings.mutate({ firstDayOfMonth: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Notifications</p>
                    <p className="text-xs text-foreground-muted">Upcoming bills, overspending, and goal milestones.</p>
                  </div>
                  <Switch
                    checked={me?.settings?.notificationsEnabled ?? true}
                    onCheckedChange={(v) => updateSettings.mutate({ notificationsEnabled: v })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data">
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Transactions</CardTitle>
                  <CardDescription>Import a bank CSV or export your current budget&apos;s transactions.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!budgetId}>
                    <Upload className="size-4" /> Import CSV
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!budgetId}
                    onClick={() => budgetId && downloadFile(`/api/budgets/${budgetId}/export/transactions`)}
                  >
                    <Download className="size-4" /> Export CSV
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Full backup</CardTitle>
                  <CardDescription>Download everything — all budgets, accounts, transactions, goals, and settings.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={downloadBackup}>
                    <Download className="size-4" /> Download backup
                  </Button>
                  <label>
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        await restoreBackupFile(file, queryClient);
                      }}
                    />
                    <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:border-border-strong">
                      <Upload className="size-4" /> Restore from backup
                    </span>
                  </label>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <SecuritySection onSignOutRedirect={() => router.push("/login")} />
          </TabsContent>
        </Tabs>
      </div>

      <AdBanner slot="settings-footer" />

      {budgetId && <ImportDialog open={importOpen} onOpenChange={setImportOpen} budgetId={budgetId} />}
    </div>
  );
}

function downloadFile(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.click();
}

async function downloadBackup() {
  try {
    const backup = await api.get<unknown>("/api/backup");
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `montra-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Couldn't create a backup. Please try again.");
  }
}

async function restoreBackupFile(file: File, queryClient: ReturnType<typeof useQueryClient>) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const result = await api.post<{ restoredBudgets: number }>("/api/backup/restore", json);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    toast.success(`Restored ${result.restoredBudgets} budget${result.restoredBudgets === 1 ? "" : "s"}.`, "They've been added as new budgets so nothing existing was overwritten.");
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : "That file couldn't be restored. Please check it's a Montra backup.");
  }
}

function ProfileSection() {
  const { data: me } = useMe();
  // On a fast (e.g. local) connection the /api/auth/me fetch can resolve
  // before hydration finishes, so `me` is already populated on the
  // client's first render while the server — which never waits on the
  // fetch — rendered the loading skeleton. Gating on `mounted` (which is
  // literally false on every environment until an effect flips it, strictly
  // after hydration commits) guarantees the first client render always
  // matches the server's, regardless of how fast the query resolves.
  const hydrated = useHasHydrated();

  if (!hydrated || !me?.user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-md bg-surface-muted" />
        </CardContent>
      </Card>
    );
  }

  return <ProfileForm key={me.user.email} email={me.user.email} initialName={me.user.name} />;
}

function ProfileForm({ email, initialName }: { email: string; initialName: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/profile", { name });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated.");
    } catch {
      toast.error("Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <p className="text-sm text-foreground-muted">{email}</p>
        </div>
        <Button onClick={save} disabled={saving} className="self-start">
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

function BudgetsSection() {
  const { data: me } = useMe();
  const createBudget = useCreateBudget();
  const renameBudget = useRenameBudget();
  const archiveBudget = useArchiveBudget();
  const deleteBudget = useDeleteBudget();
  const [newName, setNewName] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your budgets</CardTitle>
        <CardDescription>Create separate budgets for different purposes — personal, business, a trip.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {me?.budgets.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  defaultValue={b.name}
                  onBlur={(e) => e.target.value !== b.name && e.target.value.trim() && renameBudget.mutate({ id: b.id, name: e.target.value.trim() })}
                  className="max-w-xs border-none px-0 shadow-none focus-visible:ring-0"
                />
                <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted">
                  {b.currency}
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => archiveBudget.mutate({ id: b.id, isArchived: true })} aria-label="Archive budget">
                  <Archive className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => confirm(`Delete "${b.name}" and everything in it? This can't be undone.`) && deleteBudget.mutate(b.id)}
                  aria-label="Delete budget"
                >
                  <Trash2 className="size-4 text-negative" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New budget name" className="max-w-xs" />
          <Button
            variant="outline"
            onClick={() => {
              if (!newName.trim()) return;
              createBudget.mutate({ name: newName.trim(), currency: me?.settings?.currency });
              setNewName("");
            }}
          >
            <Plus className="size-4" /> Create budget
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySection({ onSignOutRedirect }: { onSignOutRedirect: () => void }) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function changePassword() {
    setPasswordError(null);
    setChangingPassword(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.success("Password changed.", "Please log in again with your new password.");
      queryClient.clear();
      onSignOutRedirect();
    } catch (err) {
      setPasswordError(err instanceof ApiRequestError ? err.message : "Couldn't change your password. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function deleteAccountAction() {
    if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.del("/api/account", { password: deletePassword });
      queryClient.clear();
      onSignOutRedirect();
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : "Couldn't delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="max-w-sm" />
          <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="max-w-sm" />
          {passwordError && <p className="text-sm text-negative">{passwordError}</p>}
          <Button onClick={changePassword} disabled={changingPassword || !currentPassword || !newPassword} className="self-start">
            {changingPassword ? "Changing…" : "Change password"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-negative/30">
        <CardHeader>
          <CardTitle className="text-negative">Delete account</CardTitle>
          <CardDescription>Permanently deletes your account and every budget, account, and transaction.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input type="password" placeholder="Confirm your password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className="max-w-sm" />
          {deleteError && <p className="text-sm text-negative">{deleteError}</p>}
          <Button variant="destructive" onClick={deleteAccountAction} disabled={deleting || !deletePassword} className="self-start">
            {deleting ? "Deleting…" : "Delete my account"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
