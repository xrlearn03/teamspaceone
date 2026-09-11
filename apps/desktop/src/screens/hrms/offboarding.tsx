import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus, ShieldAlert, UserMinus } from "lucide-react";
import {
  useCreateOffboardingCase,
  useEmployees,
  useOffboardingCases,
  useSetOffboardingTaskStatus,
  useTransitionOffboardingCase,
  useUpdateOffboardingCase,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { OffboardingCase, OffboardingTask } from "../../lib/api";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { Card, CardContent } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "./common";

const labelCls = "text-xs font-medium text-text-secondary";
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm text-text";

function caseName(c: OffboardingCase) {
  return `${c.employee.firstName} ${c.employee.lastName}`.trim();
}

function InitiateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const employees = useEmployees({});
  const create = useCreateOffboardingCase();
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState("resignation");
  const [reason, setReason] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState("");

  function submit() {
    if (!employeeId) return;
    create.mutate(
      {
        employeeId,
        type: type || undefined,
        reason: reason || undefined,
        lastWorkingDate: lastWorkingDate || undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Initiate offboarding</DialogTitle>
          <DialogDescription>Start an exit checklist for a departing employee.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Employee *</span>
            <select className={selectCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {(employees.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Type</span>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="resignation">Resignation</option>
              <option value="termination">Termination</option>
              <option value="retirement">Retirement</option>
              <option value="contract_end">Contract end</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Reason</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Last working date</span>
            <Input type="date" value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)} />
          </label>
        </div>
        {create.isError ? (
          <p className="px-4 pb-2 text-sm text-error">
            {create.error instanceof Error ? create.error.message : "Failed to initiate offboarding."}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !employeeId}>Initiate</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function groupTasks(tasks: OffboardingTask[]) {
  const groups = new Map<string, OffboardingTask[]>();
  for (const t of tasks) {
    const key = t.category || "General";
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

function CaseDetail({ item, canManage }: { item: OffboardingCase; canManage: boolean }) {
  const setTask = useSetOffboardingTaskStatus();
  const update = useUpdateOffboardingCase();
  const transition = useTransitionOffboardingCase();
  const [exitNotes, setExitNotes] = useState(item.exitInterviewNotes ?? "");
  const [settlementNotes, setSettlementNotes] = useState(item.settlementNotes ?? "");
  const open = item.status !== "completed" && item.status !== "cancelled";

  return (
    <div className="border-t bg-surface-elevated/40 px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        {item.reason ? <span>Reason: {item.reason}</span> : null}
        <div className="ml-auto flex gap-1">
          {canManage && open ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={transition.isPending}
                onClick={() => {
                  if (window.confirm(`Complete offboarding for ${caseName(item)}? This terminates the employee.`)) {
                    transition.mutate({ id: item.id, action: "complete" });
                  }
                }}
              >
                Complete offboarding
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={transition.isPending}
                onClick={() => {
                  if (window.confirm("Cancel this offboarding case?")) {
                    transition.mutate({ id: item.id, action: "cancel" });
                  }
                }}
              >
                Cancel case
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-secondary">Checklist</p>
          {item.tasks.length === 0 ? (
            <p className="text-xs text-text-muted">No tasks.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {groupTasks(item.tasks).map(([category, tasks]) => (
                <div key={category}>
                  <p className="mb-1 text-xs font-medium text-text-muted">{category}</p>
                  <ul className="flex flex-col gap-1">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        {t.status === "completed" ? (
                          <Check className="h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
                        )}
                        <span className={t.status === "completed" ? "flex-1 text-text-muted line-through" : "flex-1 text-text"}>
                          {t.title}
                        </span>
                        {t.status === "completed" && t.completedAt ? (
                          <span className="text-xs text-text-muted">{formatDate(t.completedAt)}</span>
                        ) : null}
                        {canManage && open ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={setTask.isPending}
                            onClick={() =>
                              setTask.mutate({
                                id: item.id,
                                taskId: t.id,
                                action: t.status === "completed" ? "reopen" : "complete",
                              })
                            }
                          >
                            {t.status === "completed" ? "Reopen" : "Complete"}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Exit interview notes</span>
            <textarea
              className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm text-text"
              value={exitNotes}
              onChange={(e) => setExitNotes(e.target.value)}
              disabled={!canManage || !open}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Settlement notes</span>
            <textarea
              className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm text-text"
              value={settlementNotes}
              onChange={(e) => setSettlementNotes(e.target.value)}
              disabled={!canManage || !open}
            />
          </label>
          {canManage && open ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    id: item.id,
                    body: {
                      exitInterviewNotes: exitNotes || null,
                      settlementNotes: settlementNotes || null,
                    },
                  })
                }
              >
                Save notes
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OffboardingSection() {
  const { can } = usePermissions();
  const canView = can("hrms.offboarding.view");
  const canManage = can("hrms.offboarding.manage");
  const cases = useOffboardingCases();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initiateOpen, setInitiateOpen] = useState(false);

  if (!canView) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to offboarding"
          description="Offboarding requires the hrms.offboarding.view permission."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Offboarding cases</h2>
        {canManage ? (
          <Button size="sm" onClick={() => setInitiateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Initiate offboarding
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          {cases.isLoading ? (
            <div className="p-4"><SectionSkeleton /></div>
          ) : cases.isError ? (
            <SectionError onRetry={() => cases.refetch()} />
          ) : (cases.data ?? []).length === 0 ? (
            <EmptyState
              icon={UserMinus}
              title="No offboarding cases"
              description="Offboarding cases appear when an employee exit is initiated."
            />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium" />
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Last working day</th>
                  <th className="px-4 py-2 font-medium">Tasks</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(cases.data ?? []).map((c) => {
                  const done = c.tasks.filter((t) => t.status === "completed").length;
                  const expanded = expandedId === c.id;
                  return [
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b hover:bg-surface-elevated"
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                    >
                      <td className="w-8 px-4 py-2.5 text-text-muted">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-2.5 text-text">{caseName(c)}</td>
                      <td className="px-4 py-2.5"><Badge variant="secondary">{c.type}</Badge></td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatDate(c.lastWorkingDate)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{done}/{c.tasks.length}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                    </tr>,
                    expanded ? (
                      <tr key={`${c.id}-detail`} className="border-b last:border-0">
                        <td colSpan={6} className="p-0">
                          <CaseDetail item={c} canManage={canManage} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <InitiateDialog open={initiateOpen} onOpenChange={setInitiateOpen} />
    </div>
  );
}
