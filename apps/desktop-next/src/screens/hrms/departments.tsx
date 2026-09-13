import { useState } from "react";
import { Network, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCreateDepartment,
  useCreateDesignation,
  useDeleteDepartment,
  useDepartments,
  useDesignations,
  useUpdateDepartment,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import type { Department } from "@/lib/api";
import { Button } from "@teamspace-one/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { SectionError, SectionSkeleton } from "./common";

export function DepartmentDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department?: Department | null;
}) {
  const [name, setName] = useState(department?.name ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const busy = createDepartment.isPending || updateDepartment.isPending;

  function submit() {
    if (!name.trim()) return;
    if (department) {
      updateDepartment.mutate(
        { id: department.id, body: { name: name.trim(), description: description || null } },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createDepartment.mutate(
        { name: name.trim(), description: description || undefined },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? "Edit department" : "Create department"}</DialogTitle>
          <DialogDescription>Departments group employees for reporting and scoping.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Name *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Description</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {department ? "Save" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DesignationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const createDesignation = useCreateDesignation();

  function submit() {
    if (!title.trim()) return;
    createDesignation.mutate(
      { title: title.trim(), level: level || undefined },
      {
        onSuccess: () => {
          setTitle("");
          setLevel("");
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create designation</DialogTitle>
          <DialogDescription>Designations describe job titles and levels.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Title *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Level</span>
            <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. L3, Senior" />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createDesignation.isPending || !title.trim()}>
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsSection() {
  const { can } = usePermissions();
  const departments = useDepartments();
  const designations = useDesignations();
  const deleteDepartment = useDeleteDepartment();
  const [dialog, setDialog] = useState<{ open: boolean; department?: Department | null }>({ open: false });
  const [designationOpen, setDesignationOpen] = useState(false);

  if (departments.isLoading) return <SectionSkeleton />;
  if (departments.isError) {
    return <SectionError onRetry={() => departments.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-3 sm:p-4 lg:p-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Departments</h2>
          {can("hrms.department.create") ? (
            <Button size="sm" onClick={() => setDialog({ open: true })}>
              <Plus className="mr-1 h-4 w-4" /> New department
            </Button>
          ) : null}
        </div>
        {(departments.data ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon={Network}
              title="No departments yet"
              description="Create departments to organise your people."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(departments.data ?? []).map((d) => (
              <Card key={d.id}>
                <CardHeader>
                  <CardTitle className="truncate">{d.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    {can("hrms.department.edit") ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${d.name}`}
                        onClick={() => setDialog({ open: true, department: d })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {can("hrms.department.delete") ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete department "${d.name}"?`)) {
                            deleteDepartment.mutate(d.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-error" />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-text-muted">
                    {d.memberCount ?? 0} member{(d.memberCount ?? 0) === 1 ? "" : "s"}
                  </p>
                  {d.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{d.description}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Designations</h2>
          {can("hrms.designation.create") ? (
            <Button size="sm" variant="secondary" onClick={() => setDesignationOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New designation
            </Button>
          ) : null}
        </div>
        <Card>
          <CardContent className="p-0">
            {designations.isLoading ? (
              <div className="p-4"><SectionSkeleton rows={2} /></div>
            ) : (designations.data ?? []).length === 0 ? (
              <p className="p-4 text-xs text-text-muted">No designations defined.</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {(designations.data ?? []).map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-text">{d.title ?? d.name}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{d.level ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      </div>

      <DepartmentDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open })}
        department={dialog.department}
      />
      <DesignationDialog open={designationOpen} onOpenChange={setDesignationOpen} />
    </div>
  );
}
