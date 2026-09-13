import { useMemo, useState } from "react";
import {
  Package,
  Pencil,
  PlusCircle,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  useAssets,
  useAssignAsset,
  useCreateAsset,
  useDeleteAsset,
  useMembers,
  useReturnAsset,
  useUpdateAsset,
  useUsers,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { Input } from "@teamspace-one/ui/input";
import {
  DATE_RANGE_OPTIONS,
  FilterDropdown,
  PageHeader,
  Pagination,
  PrimaryAction,
  TableToolbar,
  withinDateRange,
} from "./hr/common";
import { SectionError, SectionSkeleton, formatDate } from "@/screens/hrms/common";
import { cn } from "@/lib/utils";
import { getUserDisplayName } from "@/lib/utils";
import type { Asset, AssetInput } from "@/lib/api";

const PAGE_SIZE = 10;

const ASSET_CATEGORIES = [
  "Laptop",
  "Desktop",
  "Monitor",
  "Phone",
  "Tablet",
  "Peripheral",
  "Furniture",
  "Vehicle",
  "Other",
];

const ASSET_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function AssetStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-success/10 text-success",
    assigned: "bg-info/10 text-info",
    maintenance: "bg-warning/10 text-warning",
    retired: "bg-error/10 text-error",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? "bg-surface-elevated text-text-secondary",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

interface AssetFormState {
  name: string;
  category: string;
  assetTag: string;
  serialNumber: string;
  status: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyEnd: string;
  vendor: string;
  notes: string;
}

const EMPTY_FORM: AssetFormState = {
  name: "",
  category: "",
  assetTag: "",
  serialNumber: "",
  status: "available",
  purchaseDate: "",
  purchaseCost: "",
  warrantyEnd: "",
  vendor: "",
  notes: "",
};

function formFromAsset(asset: Asset): AssetFormState {
  return {
    name: asset.name,
    category: asset.category ?? "",
    assetTag: asset.assetTag ?? "",
    serialNumber: asset.serialNumber ?? "",
    status: asset.status,
    purchaseDate: asset.purchaseDate?.slice(0, 10) ?? "",
    purchaseCost: asset.purchaseCost != null ? String(asset.purchaseCost) : "",
    warrantyEnd: asset.warrantyEnd?.slice(0, 10) ?? "",
    vendor: asset.vendor ?? "",
    notes: asset.notes ?? "",
  };
}

function AssetFormDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset | null;
}) {
  const organisationId = useUIStore((s) => s.organisationId);
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const editing = Boolean(asset);
  // Status is driven by assign/return while an assignment is active.
  const lockedStatus = editing && Boolean(asset?.currentAssignment);

  if (open && asset && loadedFor !== asset.id) {
    setForm(formFromAsset(asset));
    setLoadedFor(asset.id);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(EMPTY_FORM);
      setLoadedFor(null);
    }
    onOpenChange(next);
  }

  function submit() {
    const body: AssetInput = {
      name: form.name.trim(),
      category: form.category || undefined,
      assetTag: form.assetTag.trim() || undefined,
      serialNumber: form.serialNumber.trim() || undefined,
      status: lockedStatus ? undefined : form.status,
      purchaseDate: form.purchaseDate || undefined,
      purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
      warrantyEnd: form.warrantyEnd || undefined,
      vendor: form.vendor.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (!organisationId) return;
    if (asset) {
      update.mutate({ organisationId, id: asset.id, body }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(
        { organisationId, body: body as AssetInput & { name: string } },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit asset" : "Add new asset"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the asset's details."
              : "Register a company asset so it can be assigned to a member."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2">
          <Field label="Asset name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. MacBook Pro 14"
              autoFocus
            />
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select category</option>
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c.toLowerCase()}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Asset ID / tag">
            <Input
              value={form.assetTag}
              onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
              placeholder="e.g. AST-001"
            />
          </Field>
          <Field label="Serial number">
            <Input
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              placeholder="e.g. C02XL0AAJ1WL"
            />
          </Field>
          <Field label="Purchase date">
            <Input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
            />
          </Field>
          <Field label="Purchase cost">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.purchaseCost}
              onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Warranty ends">
            <Input
              type="date"
              value={form.warrantyEnd}
              onChange={(e) => setForm({ ...form, warrantyEnd: e.target.value })}
            />
          </Field>
          <Field label="Vendor">
            <Input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="e.g. Apple Store"
            />
          </Field>
          <Field label="Status">
            <select
              className={cn(inputClass, lockedStatus && "opacity-60")}
              value={form.status}
              disabled={lockedStatus}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {ASSET_STATUSES.slice(1)
                .filter((s) => s.value !== "assigned" || lockedStatus)
                .map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                className="min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Condition, accessories included, …"
              />
            </Field>
          </div>
          {error ? <p className="text-sm text-error sm:col-span-2">{error.message}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!form.name.trim() || pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add asset"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignAssetDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset | null;
}) {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const { data: members } = useMembers(organisationId);
  const memberUserIds = useMemo(
    () => [...new Set((members ?? []).map((m) => m.userId))],
    [members],
  );
  const { data: users } = useUsers(memberUserIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const assign = useAssignAsset();
  const [userId, setUserId] = useState("");
  const [notes, setNotes] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setUserId("");
      setNotes("");
    }
    onOpenChange(next);
  }

  function submit() {
    if (!asset || !userId) return;
    if (!organisationId) return;
    assign.mutate(
      { organisationId, id: asset.id, userId, notes: notes.trim() || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>
            Assign {asset?.name ?? "this asset"} to an organisation member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <select
            className={inputClass}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Select a member</option>
            {(members ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {getUserDisplayName(userMap.get(m.userId), m.userId)}
              </option>
            ))}
          </select>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
          />
          {assign.error ? <p className="text-sm text-error">{assign.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!userId || assign.isPending}>
              {assign.isPending ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssetsScreen() {
  const { can } = usePermissions();
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const assets = useAssets(organisationId);
  const deleteAsset = useDeleteAsset();
  const returnAsset = useReturnAsset();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [status, setStatus] = useState("");
  const [range, setRange] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [assigning, setAssigning] = useState<Asset | null>(null);

  const all = assets.data ?? [];
  const assigneeIds = useMemo(
    () => [
      ...new Set(
        all.map((a) => a.currentAssignment?.assigneeUserId).filter(Boolean) as string[],
      ),
    ],
    [all],
  );
  const { data: assigneeUsers } = useUsers(assigneeIds);
  const userMap = useMemo(
    () => new Map((assigneeUsers ?? []).map((u) => [u.id, u])),
    [assigneeUsers],
  );

  const filtered = all.filter((a) => {
    if (status && a.status !== status) return false;
    if (!withinDateRange(a.purchaseDate ?? a.createdAt, range)) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = [a.name, a.assetTag, a.serialNumber, a.category, a.vendor]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  const canCreate = can("admin.asset.create");
  const canEdit = can("admin.asset.edit");
  const canDelete = can("admin.asset.delete");
  const canAssign = can("admin.asset.assign");
  const showActions = canEdit || canDelete || canAssign;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Assets" crumbs={["Administration", "Assets"]}>
        {canCreate && (
          <PrimaryAction icon={PlusCircle} label="Add New Asset" onClick={() => setCreateOpen(true)} />
        )}
      </PageHeader>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Assets List</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={ASSET_STATUSES}
            >
              Status
            </FilterDropdown>
            <FilterDropdown
              label="Sort By : "
              value={range}
              onChange={(v) => { setRange(v); setPage(1); }}
              options={DATE_RANGE_OPTIONS}
            />
          </div>
        </div>

        <TableToolbar
          query={query}
          onQuery={(q) => { setQuery(q); setPage(1); }}
          perPage={perPage}
          onPerPage={(n) => { setPerPage(n); setPage(1); }}
        />

        {assets.isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={5} />
          </div>
        ) : assets.isError ? (
          <SectionError onRetry={() => assets.refetch()} />
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border-t border-border px-5 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
              <Package className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text">No assets yet</p>
            <p className="max-w-xs text-xs text-text-muted">
              {canCreate
                ? "Add an asset to start tracking company hardware assigned to members."
                : "Assets will appear here once an administrator adds them."}
            </p>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <PlusCircle className="mr-1.5 h-4 w-4" />
                Add New Asset
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead>
                  <tr className="bg-surface-elevated">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded border-border" />
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-text">Asset</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Category</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Serial No</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Purchase Date</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Assigned To</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Status</th>
                    {showActions && <th className="w-28 px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const assignment = a.currentAssignment;
                    const assignee = assignment
                      ? userMap.get(assignment.assigneeUserId)
                      : undefined;
                    return (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <input type="checkbox" className="h-4 w-4 rounded border-border" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-text">{a.name}</div>
                          {a.assetTag ? (
                            <div className="text-xs text-text-muted">{a.assetTag}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 capitalize text-text-secondary">
                          {a.category ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {a.serialNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {formatDate(a.purchaseDate)}
                        </td>
                        <td className="px-4 py-3">
                          {assignment ? (
                            <span className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback>
                                  {getUserDisplayName(assignee, "?").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm text-text">
                                {getUserDisplayName(assignee, assignment.assigneeUserId)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-text-muted">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <AssetStatusPill status={a.status} />
                        </td>
                        {showActions && (
                          <td className="px-4 py-3">
                            <span className="flex items-center justify-end gap-3">
                              {canAssign &&
                                (assignment ? (
                                  <button
                                    type="button"
                                    onClick={() => organisationId && returnAsset.mutate({ organisationId, id: a.id })}
                                    disabled={returnAsset.isPending}
                                    className="text-text-muted hover:text-text"
                                    aria-label="Return asset"
                                    title="Return asset"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setAssigning(a)}
                                    className="text-text-muted hover:text-primary"
                                    aria-label="Assign asset"
                                    title="Assign to member"
                                  >
                                    <UserPlus className="h-4 w-4" />
                                  </button>
                                ))}
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setEditing(a)}
                                  className="text-text-muted hover:text-text"
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => organisationId && deleteAsset.mutate({ organisationId, id: a.id })}
                                  disabled={deleteAsset.isPending}
                                  className="text-text-muted hover:text-error"
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">
                        No assets match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={perPage} onPage={setPage} />
          </>
        )}
      </div>

      <AssetFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AssetFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        asset={editing}
      />
      <AssignAssetDialog
        open={Boolean(assigning)}
        onOpenChange={(o) => !o && setAssigning(null)}
        asset={assigning}
      />
    </div>
  );
}
